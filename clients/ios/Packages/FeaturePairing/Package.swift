// swift-tools-version: 6.2
import PackageDescription

// Warnings are errors here, and the tools version is 6.2 to reach the setting
// that does it without unsafe flags, for the reason `../AppCore/Package.swift`
// gives.
let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

// macOS is declared alongside iOS for the same reason `AppCore` declares it:
// `swift build` and `swift test` compile for the *host*, and without a floor
// `@Observable` is unavailable and the package only builds through Xcode.
//
// Keeping the host build working is not free — the camera scanner is UIKit and
// three text-entry modifiers are iOS-only, so each is behind an `#if`. It is
// worth it because everything this screen actually decides (which error the
// user is shown, what a scanned QR means, when the form may be submitted) is
// then testable in under a second without booting a simulator. The `#if`s are
// counted and argued in the README.
let package = Package(
    name: "FeaturePairing",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "FeaturePairing", targets: ["FeaturePairing"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeaturePairing",
            dependencies: ["AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "FeaturePairingTests",
            dependencies: [
                "FeaturePairing",
                "AppCore",
                .product(name: "AppCoreFakes", package: "AppCore"),
            ],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
