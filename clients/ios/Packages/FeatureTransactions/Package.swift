// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "FeatureTransactions",
    platforms: [.iOS("27.0")],
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
