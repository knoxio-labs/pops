// swift-tools-version: 6.0
import PackageDescription

// macOS is here to match DesignSystem's floor, not because this module runs
// there: a package cannot depend on one with a higher host deployment target,
// and `swift build` compiles both for the host.
let package = Package(
    name: "FeatureTransactions",
    platforms: [.iOS("27.0"), .macOS("14.0")],
    products: [.library(name: "FeatureTransactions", targets: ["FeatureTransactions"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../BFMClient"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureTransactions",
            dependencies: ["AppCore", "BFMClient", "DesignSystem"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        )
    ]
)
