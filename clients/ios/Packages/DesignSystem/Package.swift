// swift-tools-version: 6.0
import PackageDescription

// `swift build` and `swift test` compile this package for the *host*, so macOS
// needs a floor too — without one it defaults low enough that `Color.resolve`
// and `#Preview` are unavailable and the package only builds through Xcode.
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
