// swift-tools-version: 6.0
import PackageDescription

// macOS is listed alongside iOS because `swift build` and `swift test` compile
// for the host: without it the host build falls back to the toolchain's ancient
// default deployment target and every SwiftUI symbol here is unavailable. The
// module ships in an iOS app and nothing else — see README.md.
let package = Package(
    name: "DesignSystem",
    platforms: [.iOS("27.0"), .macOS("15.0")],
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
