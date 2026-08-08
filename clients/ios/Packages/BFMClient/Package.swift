// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BFMClient",
    platforms: [.iOS("27.0")],
    products: [.library(name: "BFMClient", targets: ["BFMClient"])],
    targets: [
        .target(name: "BFMClient", swiftSettings: [.swiftLanguageMode(.v6)])
    ]
)
