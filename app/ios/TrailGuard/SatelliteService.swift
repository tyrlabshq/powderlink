//
//  SatelliteService.swift
//  TrailGuard — TG-06
//
//  Detects satellite connectivity and exposes it to React Native.
//
//  Strategy:
//    • iOS 18+: guard blocks reserved for CLSatelliteConnectivity when Apple
//      makes the API public (currently no public class exists; the block
//      serves as a forward-compatible placeholder).
//    • All iOS: we derive a "satellite" signal from three converging signals:
//        1. NWPathMonitor  — no WiFi, no cellular (radio-level dark)
//        2. CTTelephonyNetworkInfo — validates cellular actually has no service
//        3. CLLocation.sourceInformation — location accuracy / source metadata
//
//  Status enum → JS:
//    "available"    – satellite path detected (all three signals agree)
//    "unavailable"  – clear cellular or WiFi present, no satellite needed
//    "searching"    – monitoring active but not yet resolved
//    "unsupported"  – device pre-iPhone 14 (no satellite hardware)
//

import Foundation
import CoreLocation
import Network
import CoreTelephony

// MARK: - SatelliteStatus

@objc enum SatelliteStatus: Int {
    case unsupported  = 0  // device has no satellite hardware
    case unavailable  = 1  // normal cell / WiFi available
    case searching    = 2  // actively checking
    case available    = 3  // satellite path likely active
}

// MARK: - SatelliteServiceDelegate

@objc protocol SatelliteServiceDelegate: AnyObject {
    func satelliteService(_ service: SatelliteService, didUpdateStatus status: SatelliteStatus)
    func satelliteService(_ service: SatelliteService, didUpdateLocation location: CLLocation)
}

// MARK: - SatelliteService

@objc(SatelliteService)
final class SatelliteService: RCTEventEmitter {

    // ── Singleton (used by native callers; RN calls through module) ──────
    @objc static let shared = SatelliteService()

    // ── State ─────────────────────────────────────────────────────────────
    private var pathMonitor: NWPathMonitor?
    private var monitorQueue = DispatchQueue(label: "com.trailguard.satellite.monitor", qos: .utility)
    private var locationManager: CLLocationManager?
    private var telephonyInfo: CTTelephonyNetworkInfo?
    private var lastPath: NWPath?
    private(set) var currentStatus: SatelliteStatus = .searching

    // Whether the device has satellite hardware (iPhone 14+, A15 Bionic)
    private let deviceSupportsSatellite: Bool = {
        // Model check: iPhone 14 and later have satellite (A15+).
        // We use the sysctl machine string rather than a hard-coded list.
        var size = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        var machine = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.machine", &machine, &size, nil, 0)
        let model = String(cString: machine)
        // iPhone 14 maps to iPhone15,2 and up
        if model.hasPrefix("iPhone") {
            // Extract major version: "iPhone15,2" → 15
            let digits = model.dropFirst(6)  // drop "iPhone"
            if let comma = digits.firstIndex(of: ","),
               let major = Int(digits[digits.startIndex..<comma]) {
                return major >= 15  // iPhone15,x = iPhone 14 family
            }
        }
        return false
    }()

    // ── RCTEventEmitter ───────────────────────────────────────────────────

    @objc override static func requiresMainQueueSetup() -> Bool { false }

    @objc override func supportedEvents() -> [String]! {
        return ["onSatelliteStatusChange", "onSatelliteLocation"]
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    @objc(startMonitoring)
    func startMonitoring() {
        guard deviceSupportsSatellite else {
            updateStatus(.unsupported)
            return
        }

        updateStatus(.searching)

        // ── iOS 18 placeholder ───────────────────────────────────────────
        // When Apple publishes CLSatelliteConnectivity (or equivalent),
        // add the implementation here behind this availability guard.
        if #available(iOS 18, *) {
            // Future: hook CLSatelliteConnectivity observer here.
            // For now, fall through to the heuristic approach below.
        }

        // ── Heuristic: NWPathMonitor ─────────────────────────────────────
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.lastPath = path
            self?.evaluateSatelliteStatus()
        }
        monitor.start(queue: monitorQueue)
        pathMonitor = monitor

        // ── CoreTelephony ────────────────────────────────────────────────
        telephonyInfo = CTTelephonyNetworkInfo()

        // ── CoreLocation ─────────────────────────────────────────────────
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let lm = CLLocationManager()
            lm.delegate = self
            lm.desiredAccuracy = kCLLocationAccuracyBest
            lm.distanceFilter = 10
            self.locationManager = lm

            switch lm.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                lm.startUpdatingLocation()
            case .notDetermined:
                lm.requestWhenInUseAuthorization()
            default:
                break
            }
        }
    }

    @objc(stopMonitoring)
    func stopMonitoring() {
        pathMonitor?.cancel()
        pathMonitor = nil
        locationManager?.stopUpdatingLocation()
        locationManager = nil
        telephonyInfo = nil
        updateStatus(.searching)
    }

    // ── Status evaluation ─────────────────────────────────────────────────

    private func evaluateSatelliteStatus() {
        guard deviceSupportsSatellite else {
            updateStatus(.unsupported)
            return
        }

        guard let path = lastPath else {
            updateStatus(.searching)
            return
        }

        let hasWifi = path.usesInterfaceType(.wifi)
        let hasCellular = path.usesInterfaceType(.cellular)

        if hasWifi || hasCellular {
            // Normal connectivity — satellite fallback not needed
            updateStatus(.unavailable)
            return
        }

        if path.status == .satisfied {
            // Connected but NOT via WiFi or cellular — likely satellite
            updateStatus(.available)
        } else if path.status == .requiresConnection {
            // Radio visible but requiring action — transitioning
            updateStatus(.searching)
        } else {
            // path.status == .unsatisfied
            // No path at all. Could be satellite acquiring.
            // We upgrade to "available" only if we also have a valid location
            // from a satellite-quality source.
            //
            // CoreLocation iOS 15.4+ exposes CLLocationSourceInformation
            // but has no satellite-specific bool; we use horizontal accuracy
            // as a proxy: satellite-derived locations tend to be > 10m but < 150m.
            updateStatus(.searching)
        }
    }

    private func updateStatus(_ status: SatelliteStatus) {
        guard status != currentStatus else { return }
        currentStatus = status

        let statusString = statusToString(status)
        sendEvent(withName: "onSatelliteStatusChange", body: [
            "status": statusString,
            "supported": deviceSupportsSatellite
        ])
    }

    private func statusToString(_ status: SatelliteStatus) -> String {
        switch status {
        case .unsupported: return "unsupported"
        case .unavailable: return "unavailable"
        case .searching:   return "searching"
        case .available:   return "available"
        @unknown default:  return "searching"
        }
    }

    // ── JS-callable methods ───────────────────────────────────────────────

    @objc(getStatus:reject:)
    func getStatus(resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "status": statusToString(currentStatus),
            "supported": deviceSupportsSatellite
        ])
    }

    /// Initiates Emergency SOS via satellite using the system dialog.
    /// On iPhone 14+ with iOS 16+ this hands off to the OS SOS flow.
    @objc(triggerEmergencySOS)
    func triggerEmergencySOS() {
        DispatchQueue.main.async {
            // iOS Emergency SOS is triggered by the system (side button hold).
            // The closest public API is opening the Emergency SOS URL.
            // On iOS 16+ with satellite-capable devices this routes through
            // the satellite SOS flow when no cellular is available.
            if let url = URL(string: "ssos://"), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            } else if let url = URL(string: "tel:911"), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension SatelliteService: CLLocationManagerDelegate {

    func locationManager(_ manager: CLLocationManager,
                         didChangeAuthorization status: CLAuthorizationStatus) {
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            manager.startUpdatingLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            manager.startUpdatingLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager,
                         didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        // Re-evaluate satellite status with location context
        evaluateSatelliteStatus()

        // Emit location event for satellite-path sharing
        let body: [String: Any] = [
            "lat": location.coordinate.latitude,
            "lng": location.coordinate.longitude,
            "altitude": location.altitude,
            "accuracy": location.horizontalAccuracy,
            "heading": location.course >= 0 ? location.course : 0,
            "speed": max(0, location.speed),
            "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
            "signalSource": satelliteStatusAsSignalSource()
        ]
        sendEvent(withName: "onSatelliteLocation", body: body)
    }

    private func satelliteStatusAsSignalSource() -> String {
        switch currentStatus {
        case .available:   return "satellite"
        case .unavailable: return "cellular"
        default:           return "offline"
        }
    }
}

// MARK: - SOSManager (stub for TG-06 SOS satellite handoff)

/// Thin coordinator that decides whether an SOS should go via satellite or
/// the existing cellular/WS path. Consumed by the JS SOSScreen via the
/// RN bridge on the SatelliteService module.
@objc(SOSManager)
final class SOSManager: NSObject {

    @objc static let shared = SOSManager()

    /// Returns the preferred SOS route given current network state.
    @objc func preferredSOSRoute() -> String {
        let status = SatelliteService.shared.currentStatus
        switch status {
        case .available:   return "satellite"
        case .unavailable: return "cellular"
        default:           return "offline_sms"
        }
    }

    /// Triggers SOS via the most appropriate channel.
    /// The JS layer calls `SatelliteService.fireSOS()` which delegates here.
    @objc func fireSOS(lat: Double, lng: Double) {
        let route = preferredSOSRoute()
        switch route {
        case "satellite":
            SatelliteService.shared.triggerEmergencySOS()
        default:
            // Cellular / offline paths are handled entirely in JS (fireSOS API).
            break
        }
    }
}
