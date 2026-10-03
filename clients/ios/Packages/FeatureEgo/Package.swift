// swift-tools-version: 6.2
import PackageDescription

let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

let package = Package(
    name: "FeatureEgo",
    platforms: [.iOS("27.0"), .macOS("15.0")],
    products: [.library(name: "FeatureEgo", targets: ["FeatureEgo"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureEgo",
            dependencies: ["AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "FeatureEgoTests",
            dependencies: [
                "FeatureEgo",
                "AppCore",
                "DesignSystem",
                .product(name: "AppCoreFakes", package: "AppCore"),
            ],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
