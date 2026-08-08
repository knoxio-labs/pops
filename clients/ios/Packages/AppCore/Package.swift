// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AppCore",
    platforms: [.iOS("27.0")],
    products: [.library(name: "AppCore", targets: ["AppCore"])],
    targets: [
        .target(name: "AppCore", swiftSettings: [.swiftLanguageMode(.v6)])
    ]
)
