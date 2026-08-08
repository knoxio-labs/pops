// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BFMClient",
    platforms: [.iOS("26.0")],
    products: [.library(name: "BFMClient", targets: ["BFMClient"])],
    targets: [
        .target(name: "BFMClient", swiftSettings: [.swiftLanguageMode(.v6)]),
        .testTarget(
            name: "BFMClientTests",
            dependencies: ["BFMClient"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
