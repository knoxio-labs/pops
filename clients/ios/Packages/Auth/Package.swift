// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Auth",
    platforms: [.iOS("27.0")],
    products: [.library(name: "Auth", targets: ["Auth"])],
    targets: [
        .target(name: "Auth", swiftSettings: [.swiftLanguageMode(.v6)])
    ]
)
