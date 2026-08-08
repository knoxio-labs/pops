// swift-tools-version: 6.0
import PackageDescription

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
            swiftSettings: [.swiftLanguageMode(.v6)]
        )
    ]
)
