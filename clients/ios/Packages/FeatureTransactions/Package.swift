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
// Unlike `FeaturePairing` this costs no platform conditionals at all — nothing
// on this screen touches a camera or a text-entry modifier that iOS alone
// carries — so every decision the list makes is answerable in under a second by
// `swift test`.
let package = Package(
    name: "FeatureTransactions",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "FeatureTransactions", targets: ["FeatureTransactions"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureTransactions",
            dependencies: ["AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "FeatureTransactionsTests",
            dependencies: [
                "FeatureTransactions",
                "AppCore",
                .product(name: "AppCoreFakes", package: "AppCore"),
            ],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
