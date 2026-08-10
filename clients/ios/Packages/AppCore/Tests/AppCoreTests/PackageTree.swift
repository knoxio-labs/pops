import Foundation

/// The source tree the guards in this target read, located from this file
/// rather than from a working directory — these tests also run inside an iOS
/// Simulator, where the process's cwd is the simulator's and not the repo's.
internal enum PackageTree {
    /// `.../Packages/AppCore/Tests/AppCoreTests/PackageTree.swift`
    internal static let directory: URL = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()

    /// The app target, the one shipping tree that is not a package.
    internal static var appDirectory: URL {
        directory.deletingLastPathComponent().appending(path: "App")
    }

    internal static func names() throws -> Set<String> {
        let contents = try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isDirectoryKey]
        )
        return Set(
            contents
                .filter { (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true }
                .map(\.lastPathComponent)
        )
    }

    internal static func manifestSource(ofPackage package: String) throws -> String {
        let manifest = directory.appending(path: package).appending(path: "Package.swift")
        return try String(contentsOf: manifest, encoding: .utf8)
    }
}
