// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DesignSystem",
    platforms: [.iOS("27.0")],
    products: [.library(name: "DesignSystem", targets: ["DesignSystem"])],
    targets: [
        .target(name: "DesignSystem", swiftSettings: [.swiftLanguageMode(.v6)])
    ]
)
