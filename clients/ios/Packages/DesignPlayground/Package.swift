// swift-tools-version: 6.2
import PackageDescription

// Warnings are errors here, and the tools version is 6.2 to reach the setting
// that does it without unsafe flags, for the reason `../AppCore/Package.swift`
// gives.
let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

// Two dependencies, and the list is the point: `AppCore` for the domain types a
// fixture is written in and `DesignSystem` for the primitives a surface draws
// with. Both declare no dependencies of their own, so this package links no
// networking, no persistence and no view model — see `Catalog.swift` for why
// that is a rule rather than a coincidence.
//
// macOS is declared alongside iOS for the same reason `AppCore` declares it:
// `swift build` and `swift test` compile for the *host*, and without a floor
// `@Observable` is unavailable and the package only builds through Xcode.
let package = Package(
    name: "DesignPlayground",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "DesignPlayground", targets: ["DesignPlayground"])],
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "DesignPlayground",
            dependencies: ["AppCore", "DesignSystem"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "DesignPlaygroundTests",
            dependencies: ["DesignPlayground"],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
