// One coordinate, printed as "lat,lon", then exit. That is the entire job.
//
// Macs have no GPS. CoreLocation answers this by looking at which Wi-Fi
// networks are in range and comparing them against Apple's database of where
// those networks have been seen before, which lands somewhere in the 10-50m
// range in a city — enough to tell which building you're in, not enough to
// tell where in it. No scanning is done by this program and no network name
// is ever read: macOS redacts SSIDs from unprivileged processes anyway, which
// is exactly why this asks CoreLocation for an answer instead of trying to
// work one out from the network.
//
// Deliberately a one-shot rather than a daemon. It wakes, gets a fix, prints
// it, and dies, so nothing sits resident holding the location framework open
// between readings.
//
// This is built into an app bundle rather than left as a plain executable,
// and that is not cosmetic. requestWhenInUseAuthorization() checks for
// NSLocationWhenInUseUsageDescription in the calling bundle's Info.plist and
// does nothing at all when it's missing — no dialog, no entry in System
// Settings, no error. A bare CLI binary has no Info.plist to put that string
// in, so it can never be granted location access and never even appears in
// the list of things you could grant it to. See Locate-Info.plist.
//
// install.sh does the assembling. Don't build this by hand with plain
// swiftc and expect it to work.

import CoreLocation
import Foundation

let TIMEOUT_S = 20.0

// Exit codes are the interface — report.sh distinguishes "not authorised"
// (stop trying, tell the user) from "no fix yet" (fine, try again in three
// minutes, this happens in basements and on planes).
let EXIT_DENIED: Int32 = 2
let EXIT_TIMEOUT: Int32 = 3

// When macOS is launched via `open`, stdout goes nowhere — the process is
// started by launchservices, not by the shell that asked for it. install.sh
// needs that first fix (the one that comes with the permission dialog), so
// there's a file to leave it in as well.
let outPath: String? = {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "--out"), i + 1 < args.count else { return nil }
    return args[i + 1]
}()

func emit(_ line: String) {
    print(line)
    if let path = outPath {
        try? line.write(toFile: path, atomically: true, encoding: .utf8)
    }
}

func fail(_ message: String, _ code: Int32) -> Never {
    FileHandle.standardError.write(Data("locate: \(message)\n".utf8))
    if let path = outPath {
        try? "ERR \(code) \(message)".write(toFile: path, atomically: true, encoding: .utf8)
    }
    exit(code)
}

func describe(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "notDetermined (no prompt has been answered yet)"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorized, .authorizedAlways: return "authorized"
    @unknown default: return "unknown"
    }
}

final class OneShot: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    var status: CLAuthorizationStatus { manager.authorizationStatus }
    var servicesOn: Bool { CLLocationManager.locationServicesEnabled() }

    func start() {
        manager.delegate = self
        // Ten metres, because the server's job is to pick one storefront
        // out of a terrace of them, and neighbouring venues sit 10-20m
        // apart. Asking for hundred-metre accuracy here was measured to
        // name the shop next door on dense blocks — the fix is only as
        // good as what we ask for. Still Wi-Fi positioning (Macs have no
        // GPS), still a one-shot, so the battery cost is the same scan
        // either way.
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        evaluate(manager.authorizationStatus)
    }

    private func evaluate(_ status: CLAuthorizationStatus) {
        switch status {
        case .notDetermined:
            // Only ever prompts when there's a session to prompt in, which
            // means the first run has to be by hand. Under launchd this
            // simply stays notDetermined and times out.
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            fail("location access denied — System Settings > Privacy & Security > Location Services", EXIT_DENIED)
        default:
            manager.startUpdatingLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        evaluate(manager.authorizationStatus)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let fix = locations.last else { return }
        // A negative accuracy means the fix is invalid; wait for a real one
        // rather than printing a coordinate that means nothing.
        guard fix.horizontalAccuracy >= 0 else { return }
        manager.stopUpdatingLocation()
        emit("\(fix.coordinate.latitude),\(fix.coordinate.longitude)")
        exit(0)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let clError = error as? CLError, clError.code == .denied {
            fail("location access denied", EXIT_DENIED)
        }
        // Everything else is transient — no Wi-Fi in range, no network to
        // reach Apple's lookup. Let the timeout handle it.
    }
}

let shot = OneShot()
shot.start()

DispatchQueue.main.asyncAfter(deadline: .now() + TIMEOUT_S) {
    // Which of the two silent failures this was matters a lot during setup:
    // still notDetermined means nothing ever asked me (no session to prompt
    // in — run it from a real terminal), while authorized-but-no-fix is just
    // a bad spot for Wi-Fi positioning.
    let why = shot.servicesOn
        ? "authorization is \(describe(shot.status))"
        : "Location Services is switched off system-wide"
    fail("no fix within \(Int(TIMEOUT_S))s — \(why)", EXIT_TIMEOUT)
}
RunLoop.main.run()
