// swift-tools-version: 6.2
import PackageDescription

let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

let package = Package(
    name: "FeatureTrips",
    platforms: [.iOS("27.0"), .macOS("15.0")],
    products: [.library(name: "FeatureTrips", targets: ["FeatureTrips"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureTrips", dependencies: ["AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "FeatureTripsTests",
            dependencies: [
                "FeatureTrips", "AppCore", "DesignSystem",
                .product(name: "DesignSystemTestSupport", package: "DesignSystem"),
            ],
            resources: [.process("Resources")],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
