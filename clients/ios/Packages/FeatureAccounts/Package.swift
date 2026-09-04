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
let package = Package(
    name: "FeatureAccounts",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "FeatureAccounts", targets: ["FeatureAccounts"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureAccounts",
            dependencies: ["AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "FeatureAccountsTests",
            dependencies: [
                "FeatureAccounts",
                "AppCore",
                .product(name: "AppCoreFakes", package: "AppCore"),
                .product(name: "DesignSystemTestSupport", package: "DesignSystem"),
            ],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
