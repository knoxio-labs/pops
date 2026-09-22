// swift-tools-version: 6.2
import PackageDescription

// Warnings are errors here, and the tools version is 6.2 to reach the setting
// that does it without unsafe flags, for the reason `../AppCore/Package.swift`
// gives.
let strictSwiftSettings: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
    .treatAllWarnings(as: .error),
]

// macOS is declared alongside iOS so `swift test` runs the replica suites on the
// host toolchain, which is where `mise run test:packages` runs them. The app
// itself is iOS-only.
let package = Package(
    name: "InventoryReplica",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "InventoryReplica", targets: ["InventoryReplica"])],
    // `AppCore` for the seams this package implements. GRDB is the phone's
    // local database (Inventory ADR-002 D11): explicit transactions, a
    // migrator, and FTS5 under the system SQLite. It is the first external
    // dependency that is not Apple's, which is why `ModuleBoundaryTests` names
    // it for this package alone.
    //
    // `exact:` for the reason `../BFMClient/Package.swift` gives: the Xcode
    // project is generated and gitignored, so no committed `Package.resolved`
    // pins what the app links, and a range would let two machines build two
    // different database layers.
    dependencies: [
        .package(path: "../AppCore"),
        .package(url: "https://github.com/groue/GRDB.swift", exact: "7.11.1"),
    ],
    targets: [
        .target(
            name: "InventoryReplica",
            dependencies: [
                "AppCore",
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            swiftSettings: strictSwiftSettings
        ),
        .testTarget(
            name: "InventoryReplicaTests",
            dependencies: [
                "InventoryReplica",
                "AppCore",
                .product(name: "AppCoreFakes", package: "AppCore"),
            ],
            swiftSettings: strictSwiftSettings
        ),
    ]
)
