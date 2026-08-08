// swift-tools-version: 6.0
import PackageDescription

// macOS appears here only so `swift build` and `swift test` work: they compile
// for the host, and SwiftPM's default host deployment target predates every
// SwiftUI symbol this module uses. 14.0 is the floor those symbols need. The
// module ships in an iOS app and nothing else — see README.md.
let package = Package(
    name: "DesignSystem",
    platforms: [.iOS("27.0"), .macOS("14.0")],
    products: [.library(name: "DesignSystem", targets: ["DesignSystem"])],
    targets: [
        .target(
            name: "DesignSystem",
            resources: [.process("Resources/Colors.xcassets")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "DesignSystemTests",
            dependencies: ["DesignSystem"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
