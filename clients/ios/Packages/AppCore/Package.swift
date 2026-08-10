// swift-tools-version: 6.2
import PackageDescription

// `project.yml` sets SWIFT_TREAT_WARNINGS_AS_ERRORS, and it stops at the app
// target: SwiftPM compiles a package from its own manifest, so a warning here is
// only ever a warning however strictly the consuming project is configured. The
// app's `sources:` is one thin directory and everything it does lives in these
// packages, so without this restated in each of them the gate covers almost
// nothing. `AppCoreTests` checks that they all still say it.
//
// `.treatAllWarnings(as:)` rather than `.unsafeFlags(["-warnings-as-errors"])`,
// and that is what needs tools version 6.2: SwiftPM refuses to let a package
// using unsafe flags be depended on by another package, and the packages here
// depend on each other by path.
let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

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
        .target(name: "AppCore", swiftSettings: strictSwiftSettings),
        .target(
            name: "AppCoreFakes",
            dependencies: ["AppCore"],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "AppCoreTests",
            dependencies: ["AppCore", "AppCoreFakes"],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
