// swift-tools-version: 6.2
import PackageDescription

let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

let package = Package(
    name: "FeatureSearch",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "FeatureSearch", targets: ["FeatureSearch"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureSearch",
            dependencies: ["AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "FeatureSearchTests",
            dependencies: ["FeatureSearch", "AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
