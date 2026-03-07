//
//  SatelliteService.swift
//  TrailGuard — TG-06
//
//  Pure Swift satellite connectivity service.
//  All React Native bridge work is handled by RCTSatelliteModule.m (ObjC).
//
//  Detection strategy:
//    • iOS 18+: @available guard reserved for CLSatelliteConnectivity when
//      Apple publishes the public API (no such class exists yet).
//    • All iOS 17+: heuristic using NWPathMonitor + CTTelephonyNetworkInfo.
//      Satellite is inferred when the device has no WiFi, no cellular, yet
//      is iPhone-14-class hardware (first generation with satellite radio).
//
//  Status values:
//    "available"   – satellite path detected
//    "unavailable" – cellular / WiFi present; satellite not needed
//    "searching"   – monitoring active, not yet resolved
//    "unsupported" – device lacks satellite hardware (pre-iPhone 14)
//

import Foundation
import CoreLocation
import Network
import CoreTelephony

// MARK: - SatelliteStatus

@objc public enum SatelliteStatus: Int {
    case unsupported = 0
    case unavailable = 1
    case searching   = 2
    case available   = 3
}

// MARK: - SatelliteServiceDelegate

@objc public protocol SatelliteServiceDelegate: AnyObject {
    func satelliteService(_ service: SatelliteService, didChangeStatus status: SatelliteStatus)
    func satelliteService(_ service: SatelliteService, didUpdateLocation location: CLLocation)
}

// MARK: - SatelliteService

@objc public final class SatelliteService: NSObject {

    // ── Shared instance (used by ObjC module) ────────────────────────────
    @objc public static let shared = SatelliteService()

    // ── Delegate ─────────────────────────────────────────────────────────
    @objc public weak var delegate: SatelliteServiceDelegate?

    // ── State ─────────────────────────────────────────────────────────────
    private var pathMonitor: NWPathMonitor?
    private let monitorQueue = DispatchQueue(label: "com.trailguard.satellite", qos: .utility)
    private var locationManager: CLLocationManager?

    @objc public private(set) var currentStatus: SatelliteStatus = .searching
    private var lastPath: NWPath?

    // ── Hardware capability ───────────────────────────────────────────────

    /// True on iPhone 14+ (A15/A16 Bionic), which introduced satellite radio.
    @objc public let deviceSupportsSatellite: Bool = {
        var size = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        var machine = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.machine", &machine, &size, nil, 0)
        let model = String(cString: machine)
        // iPhone15,x = iPhone 14 family; iPhone16,x = iPhone 15; etc.
        if model.hasPrefix("iPhone"),
           let commaIdx = model.firstIndex(of: ",") {
            let majorStr = model[model.index(model.startIndex, offsetBy: 6)..<commaIdx]
            if let major = Int(majorStr) {
                return major >= 15
            }
        }
        // Simulator — treat as supported so we can test
        if model.hasPrefix("x86_64") || model.hasPrefix("arm64") {
            return true
        }
        return false
    }()

    // MARK: - Monitoring

    @objc public func startMonitoring() {
        guard deviceSupportsSatellite else {
            updateStatus(.unsupported)
            return
        }

        updateStatus(.searching)

        // ── iOS 18 placeholder ───────────────────────────────────────────
        if #available(iOS 18, *) {
            // Future: adopt CLSatelliteConnectivity or equivalent API here
            // when Apple makes it public. The heuristic below remains active
            // as a fallback for all OS versions.
        }

        // ── NWPathMonitor ────────────────────────────────────────────────
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            self?.lastPath = path
            self?.evaluateStatus()
        }
        monitor.start(queue: monitorQueue)
        pathMonitor = monitor

        // ── CoreLocation ─────────────────────────────────────────────────
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let lm = CLLocationManager()
            lm.delegate = self
            lm.desiredAccuracy = kCLLocationAccuracyBest
            lm.distanceFilter = 10
            self.locationManager = lm

            let authStatus = lm.authorizationStatus
            switch authStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                lm.startUpdatingLocation()
            case .notDetermined:
                lm.requestWhenInUseAuthorization()
            default:
                break
            }
        }
    }

    @objc public func stopMonitoring() {
        pathMonitor?.cancel()
        pathMonitor = nil
        DispatchQueue.main.async { [weak self] in
            self?.locationManager?.stopUpdatingLocation()
            self?.locationManager = nil
        }
        updateStatus(.searching)
    }

    // MARK: - Status evaluation

    private func evaluateStatus() {
        guard deviceSupportsSatellite else {
            updateStatus(.unsupported)
            return
        }
        guard let path = lastPath else {
            updateStatus(.searching)
            return
        }

        let hasWifi     = path.usesInterfaceType(.wifi)
        let hasCellular = path.usesInterfaceType(.cellular)

        if hasWifi || hasCellular {
            // Normal connectivity — satellite not engaged
            updateStatus(.unavailable)
        } else if path.status == .satisfied {
            // Satisfied with no WiFi / cellular → satellite path active
            updateStatus(.available)
        } else {
            // No path yet — keep searching
            updateStatus(.searching)
        }
    }

    private func updateStatus(_ status: SatelliteStatus) {
        guard status != currentStatus else { return }
        currentStatus = status
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.satelliteService(self, didChangeStatus: status)
        }
    }

    // MARK: - SOS routing

    /// Returns the recommended SOS route given current satellite state.
    @objc public func preferredSOSRoute() -> String {
        switch currentStatus {
        case .available:   return "satellite"
        case .unavailable: return "cellular"
        default:           return "offline_sms"
        }
    }

    /// Status as a string for JS consumption.
    @objc public func statusString() -> String {
        switch currentStatus {
        case .unsupported: return "unsupported"
        case .unavailable: return "unavailable"
        case .searching:   return "searching"
        case .available:   return "available"
        @unknown default:  return "searching"
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension SatelliteService: CLLocationManagerDelegate {

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let auth = manager.authorizationStatus
        if auth == .authorizedAlways || auth == .authorizedWhenInUse {
            manager.startUpdatingLocation()
        }
    }

    public func locationManager(_ manager: CLLocationManager,
                                didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        evaluateStatus()
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.satelliteService(self, didUpdateLocation: location)
        }
    }

    public func locationManager(_ manager: CLLocationManager,
                                didChangeAuthorization status: CLAuthorizationStatus) {
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            manager.startUpdatingLocation()
        }
    }
}
