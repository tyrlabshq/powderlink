//
//  MeshNetworkManager.swift
//  TrailGuard — TG-07
//
//  Bluetooth LE + WiFi mesh networking via MultipeerConnectivity.
//  Enables group member location sharing without internet connectivity.
//
//  Architecture:
//    • Each device advertises itself and browses for peers simultaneously.
//    • Peers auto-connect (invitation sent immediately on discovery).
//    • Location data is broadcast to ALL connected peers every 5 seconds.
//    • Any received message is forwarded to all OTHER peers (relay/mesh hop).
//    • Messages carry a TTL (max 5 hops) to prevent infinite relay loops.
//    • Works up to ~100m per Bluetooth LE hop; chained hops extend range.
//
//  Service type: "tg-mesh" (must be ≤15 chars, lowercase alphanumeric + hyphens)
//

import Foundation
import MultipeerConnectivity
import CoreLocation

// MARK: - MeshMessage

/// Envelope for all data sent over the mesh.
private struct MeshMessage: Codable {
    enum MessageType: String, Codable {
        case locationUpdate = "location_update"
        case groupMessage   = "group_message"
        case ping           = "ping"
    }

    var type: MessageType
    /// Originating peer's display name (user-visible name, not MCPeerID).
    var riderId: String
    var riderName: String
    /// Remaining relay hops. Decremented on each forward. Dropped when 0.
    var ttl: Int
    /// Message-level dedup key (UUID string).
    var messageId: String

    // Location payload (present when type == .locationUpdate)
    var lat: Double?
    var lng: Double?
    var speedMph: Double?
    var battery: Int?
    var timestamp: Double?   // Unix ms

    // Chat payload (present when type == .groupMessage)
    var text: String?
    var preset: String?
}

// MARK: - MeshNetworkManagerDelegate

@objc public protocol MeshNetworkManagerDelegate: AnyObject {
    /// Called when the set of connected peer display names changes.
    func meshManager(_ manager: MeshNetworkManager, didUpdatePeers peerNames: [String])

    /// Called when a location update is received from a mesh peer.
    func meshManager(_ manager: MeshNetworkManager,
                     didReceiveLocation info: [String: Any])

    /// Called when a group chat message arrives over the mesh.
    func meshManager(_ manager: MeshNetworkManager,
                     didReceiveGroupMessage info: [String: Any])

    /// Called when mesh state changes (e.g. started, stopped, peer count).
    func meshManager(_ manager: MeshNetworkManager, didChangeState info: [String: Any])
}

// MARK: - MeshNetworkManager

@objc public final class MeshNetworkManager: NSObject {

    // ── Singleton ─────────────────────────────────────────────────────────
    @objc public static let shared = MeshNetworkManager()

    // ── Delegate ──────────────────────────────────────────────────────────
    @objc public weak var delegate: MeshNetworkManagerDelegate?

    // ── MultipeerConnectivity ─────────────────────────────────────────────
    private static let serviceType = "tg-mesh"
    private var peerID: MCPeerID!
    private var session: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?

    // ── State ─────────────────────────────────────────────────────────────
    @objc public private(set) var isRunning = false
    private var riderId   = "unknown"
    private var riderName = "Rider"

    // Location broadcast
    private var locationBroadcastTimer: Timer?
    private var latestLocation: CLLocation?
    private var latestBattery: Int = 100

    // Dedup: track messageIds we've already seen/forwarded
    private var seenMessageIds = Set<String>()
    private let seenCleanupInterval: TimeInterval = 120
    private var seenCleanupTimer: Timer?

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let queue   = DispatchQueue(label: "com.trailguard.mesh", qos: .userInitiated)

    // MARK: - Start / Stop

    /// Start advertising and browsing. Call once per session.
    @objc public func start(riderId: String, riderName: String) {
        queue.async { [weak self] in
            guard let self, !self.isRunning else { return }

            self.riderId   = riderId
            self.riderName = riderName

            // Use riderId as MCPeerID display name so peers can identify us.
            // MCPeerID display name is capped at 63 bytes; truncate to be safe.
            let displayName = String(riderId.prefix(63))
            self.peerID = MCPeerID(displayName: displayName)

            let session = MCSession(peer: self.peerID,
                                    securityIdentity: nil,
                                    encryptionPreference: .optional)
            session.delegate = self
            self.session = session

            // Advertise our presence
            let advertiser = MCNearbyServiceAdvertiser(peer: self.peerID,
                                                       discoveryInfo: ["name": riderName],
                                                       serviceType: Self.serviceType)
            advertiser.delegate = self
            advertiser.startAdvertisingPeer()
            self.advertiser = advertiser

            // Browse for peers
            let browser = MCNearbyServiceBrowser(peer: self.peerID,
                                                  serviceType: Self.serviceType)
            browser.delegate = self
            browser.startBrowsingForPeers()
            self.browser = browser

            self.isRunning = true

            // Start location broadcast timer (every 5 seconds)
            DispatchQueue.main.async {
                self.locationBroadcastTimer = Timer.scheduledTimer(
                    withTimeInterval: 5.0, repeats: true
                ) { [weak self] _ in
                    self?.broadcastLocation()
                }
                // Periodic dedup-cache cleanup
                self.seenCleanupTimer = Timer.scheduledTimer(
                    withTimeInterval: self.seenCleanupInterval, repeats: true
                ) { [weak self] _ in
                    self?.queue.async { self?.seenMessageIds.removeAll() }
                }
            }

            self.notifyStateChange()
        }
    }

    @objc public func stop() {
        queue.async { [weak self] in
            guard let self, self.isRunning else { return }

            self.locationBroadcastTimer?.invalidate()
            self.locationBroadcastTimer = nil
            self.seenCleanupTimer?.invalidate()
            self.seenCleanupTimer = nil

            self.advertiser?.stopAdvertisingPeer()
            self.advertiser = nil
            self.browser?.stopBrowsingForPeers()
            self.browser = nil
            self.session?.disconnect()
            self.session = nil
            self.peerID  = nil

            self.isRunning = false
            self.seenMessageIds.removeAll()
            self.notifyStateChange()
        }
    }

    // MARK: - Location injection (called by JS / LocationService)

    @objc public func updateLocation(lat: Double, lng: Double,
                                      speedMph: Double, battery: Int) {
        latestLocation = CLLocation(latitude: lat, longitude: lng)
        latestBattery  = battery
        // Don't wait for the timer — broadcast immediately on first update
        if isRunning { broadcastLocation() }
    }

    // MARK: - Send group chat message over mesh

    @objc public func sendGroupMessage(text: String, preset: String?) {
        let msg = MeshMessage(
            type:      .groupMessage,
            riderId:   riderId,
            riderName: riderName,
            ttl:       5,
            messageId: UUID().uuidString,
            text:      text,
            preset:    preset
        )
        broadcast(msg, excludingPeers: [])
    }

    // MARK: - Connected peer names

    @objc public var connectedPeerNames: [String] {
        session?.connectedPeers.map(\.displayName) ?? []
    }

    @objc public var connectedPeerCount: Int {
        session?.connectedPeers.count ?? 0
    }

    // MARK: - Private helpers

    private func broadcastLocation() {
        guard let loc = latestLocation else { return }
        let msg = MeshMessage(
            type:      .locationUpdate,
            riderId:   riderId,
            riderName: riderName,
            ttl:       5,
            messageId: UUID().uuidString,
            lat:       loc.coordinate.latitude,
            lng:       loc.coordinate.longitude,
            speedMph:  max(0, loc.speed * 2.237),  // m/s → mph
            battery:   latestBattery,
            timestamp: Date().timeIntervalSince1970 * 1000
        )
        broadcast(msg, excludingPeers: [])
    }

    /// Encode and send a MeshMessage to all connected peers except excluded ones.
    private func broadcast(_ msg: MeshMessage, excludingPeers excluded: [MCPeerID]) {
        guard let session = session,
              !session.connectedPeers.isEmpty else { return }

        let targets = session.connectedPeers.filter { !excluded.contains($0) }
        guard !targets.isEmpty else { return }

        do {
            let data = try encoder.encode(msg)
            try session.send(data, toPeers: targets, with: .reliable)
        } catch {
            // Non-fatal; next broadcast cycle will retry
        }
    }

    /// Forward a received message to all peers EXCEPT the one who sent it.
    private func relay(_ msg: MeshMessage, from sender: MCPeerID) {
        guard msg.ttl > 1 else { return }
        var forwarded = msg
        forwarded.ttl -= 1
        broadcast(forwarded, excludingPeers: [sender])
    }

    private func notifyStateChange() {
        let info: [String: Any] = [
            "isRunning":    isRunning,
            "peerCount":    connectedPeerCount,
            "peerNames":    connectedPeerNames,
        ]
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.meshManager(self, didChangeState: info)
        }
    }
}

// MARK: - MCSessionDelegate

extension MeshNetworkManager: MCSessionDelegate {

    public func session(_ session: MCSession,
                        peer peerID: MCPeerID,
                        didChange state: MCSessionState) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let names = session.connectedPeers.map(\.displayName)
            self.delegate?.meshManager(self, didUpdatePeers: names)
            self.notifyStateChange()
        }
    }

    public func session(_ session: MCSession,
                        didReceive data: Data,
                        fromPeer peerID: MCPeerID) {
        queue.async { [weak self] in
            guard let self else { return }

            guard let msg = try? self.decoder.decode(MeshMessage.self, from: data) else { return }

            // Dedup: skip if already processed
            guard !self.seenMessageIds.contains(msg.messageId) else { return }
            self.seenMessageIds.insert(msg.messageId)

            // Relay to other peers (mesh forwarding)
            self.relay(msg, from: peerID)

            // Deliver to local observer
            DispatchQueue.main.async {
                switch msg.type {
                case .locationUpdate:
                    let info: [String: Any] = [
                        "riderId":   msg.riderId,
                        "riderName": msg.riderName,
                        "lat":       msg.lat    ?? 0,
                        "lng":       msg.lng    ?? 0,
                        "speedMph":  msg.speedMph ?? 0,
                        "battery":   msg.battery  ?? 100,
                        "timestamp": msg.timestamp ?? (Date().timeIntervalSince1970 * 1000),
                        "source":    "mesh",
                    ]
                    self.delegate?.meshManager(self, didReceiveLocation: info)

                case .groupMessage:
                    let info: [String: Any] = [
                        "messageId": msg.messageId,
                        "riderId":   msg.riderId,
                        "riderName": msg.riderName,
                        "text":      msg.text   ?? "",
                        "preset":    msg.preset  as Any,
                        "timestamp": Date().timeIntervalSince1970 * 1000,
                        "source":    "mesh",
                    ]
                    self.delegate?.meshManager(self, didReceiveGroupMessage: info)

                case .ping:
                    break
                }
            }
        }
    }

    // Unused delegate methods — required by protocol
    public func session(_ session: MCSession, didReceive stream: InputStream,
                        withName streamName: String, fromPeer peerID: MCPeerID) {}
    public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String,
                        fromPeer peerID: MCPeerID, with progress: Progress) {}
    public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String,
                        fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

// MARK: - MCNearbyServiceAdvertiserDelegate

extension MeshNetworkManager: MCNearbyServiceAdvertiserDelegate {

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser,
                           didReceiveInvitationFromPeer peerID: MCPeerID,
                           withContext context: Data?,
                           invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        // Auto-accept all invitations from TrailGuard peers
        invitationHandler(true, session)
    }

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser,
                           didNotStartAdvertisingPeer error: Error) {
        // Advertising failure is non-fatal; browsing continues
    }
}

// MARK: - MCNearbyServiceBrowserDelegate

extension MeshNetworkManager: MCNearbyServiceBrowserDelegate {

    public func browser(_ browser: MCNearbyServiceBrowser,
                        foundPeer peerID: MCPeerID,
                        withDiscoveryInfo info: [String: String]?) {
        guard let session = session else { return }
        // Don't invite peers we're already connected to
        guard !session.connectedPeers.contains(peerID) else { return }
        browser.invitePeer(peerID, to: session, withContext: nil, timeout: 10)
    }

    public func browser(_ browser: MCNearbyServiceBrowser,
                        lostPeer peerID: MCPeerID) {
        // Peer went out of range; session will handle cleanup
        notifyStateChange()
    }

    public func browser(_ browser: MCNearbyServiceBrowser,
                        didNotStartBrowsingForPeers error: Error) {
        // Browse failure is non-fatal; advertising continues
    }
}
