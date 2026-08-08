// swift-tools-version: 6.0
import PackageDescription

// macOS is declared alongside iOS so `swift test` runs the fake-backed and
// fixture suites on a developer machine and on a CI runner without a simulator.
// The app itself is iOS-only; nothing here is shipped for macOS.
let package = Package(
    name: "Auth",
    platforms: [.iOS("26.0"), .macOS(.v15)],
    products: [
        .library(name: "Auth", targets: ["Auth"]),
        .library(name: "AuthTestSupport", targets: ["AuthTestSupport"]),
    ],
    targets: [
        .target(name: "Auth", swiftSettings: [.swiftLanguageMode(.v6)]),
        .target(
            name: "AuthTestSupport",
            dependencies: ["Auth"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "AuthTests",
            dependencies: ["Auth", "AuthTestSupport"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
