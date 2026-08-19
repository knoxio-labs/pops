// swift-tools-version: 6.2
import PackageDescription

// Warnings are errors here, and the tools version is 6.2 to reach the setting
// that does it without unsafe flags, for the reason `../AppCore/Package.swift`
// gives.
let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

// `swift build` and `swift test` compile this package for the *host*, so macOS
// needs a floor too — without one it defaults low enough that `Color.resolve`
// and `#Preview` are unavailable and the package only builds through Xcode.
let package = Package(
    name: "DesignSystem",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"]),
        .library(name: "DesignSystemTestSupport", targets: ["DesignSystemTestSupport"]),
    ],
    targets: [
        .target(
            name: "DesignSystem",
            resources: [.process("Resources/Colors.xcassets")],
            swiftSettings: strictSwiftSettings
        ),
        // A diagnostic every consumer's colour-scheme-dependent rendering
        // assertions need, not just this package's own — split out like
        // `../AppCore/Package.swift` splits `AppCoreFakes` from `AppCore`,
        // so a package that only wants the design system does not also link
        // this.
        .target(
            name: "DesignSystemTestSupport",
            dependencies: ["DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "DesignSystemTests",
            dependencies: ["DesignSystem", "DesignSystemTestSupport"],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
