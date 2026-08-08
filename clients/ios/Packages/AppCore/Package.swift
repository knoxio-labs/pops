// swift-tools-version: 6.0
import PackageDescription

// `swift build` and `swift test` compile this package for the *host*, so macOS
// needs a floor too — without one it defaults low enough that `@Observable` and
// `@Entry` are unavailable and the package only builds through Xcode.
let package = Package(
    name: "AppCore",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [
        .library(name: "AppCore", targets: ["AppCore"]),
        .library(name: "AppCoreFakes", targets: ["AppCoreFakes"]),
    ],
    targets: [
        .target(name: "AppCore", swiftSettings: [.swiftLanguageMode(.v6)]),
        .target(
            name: "AppCoreFakes",
            dependencies: ["AppCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "AppCoreTests",
            dependencies: ["AppCore", "AppCoreFakes"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
