import Foundation

/// Where the token-discipline rules get applied, and the fixtures that prove the
/// application itself works.
///
/// Split out of `TokenDisciplineTests` because none of it is an assertion: it is
/// the machinery a suite of assertions drives. Keeping it here leaves that suite
/// as the list of claims it is supposed to be.
internal enum TokenDisciplineScan {
    static let clientRoot = URL(filePath: #filePath)
        .deletingLastPathComponent()  // DesignSystemTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // DesignSystem
        .deletingLastPathComponent()  // Packages
        .deletingLastPathComponent()  // clients/ios

    static let packagesRoot = clientRoot.appending(path: "Packages")

    /// The composition root. It is an Xcode target rather than a SwiftPM
    /// package, so ``scanModules(under:)`` — which discovers by `Package.swift`
    /// — cannot find it, and it needs naming explicitly. It is in scope for the
    /// same reason every module is: it assembles the feature screens, which
    /// makes it the likeliest place for a `.padding(16)` to land unnoticed.
    ///
    /// `Tools/` is a separate tree with a separate gap (POPS-1515) and is not
    /// folded in here.
    static let appRoot = clientRoot.appending(path: "App")

    /// What one pass over a `Packages` tree found. Everything but `violations`
    /// exists because the ways this scan can cover less than it claims all look
    /// identical from the violation list: no modules, a module with no sources,
    /// and a directory that was never recognised as a module all produce zero
    /// violations, which is the same answer as a clean tree.
    struct ModuleScan {
        let roots: [URL]
        let emptyRoots: [URL]
        let unrecognised: [URL]
        let violations: [TokenDisciplineScanner.Violation]
    }

    /// One source root's contribution: what it violated, and whether it held no
    /// hand-written Swift at all.
    ///
    /// Emptiness is returned rather than folded into a clean violation list
    /// because the two are indistinguishable from the caller's side, and only
    /// one of them is good news: a root that yields nothing is a root that was
    /// renamed out from under the scan, not a root with nothing to say.
    ///
    /// An absent path is the only failure this is allowed to call empty. A
    /// `Sources` that exists but holds no hand-written Swift — nothing, or only
    /// `Generated` code — is the other, legitimate route to empty, and is the
    /// `files.isEmpty` branch. Anything else the filesystem objects to is a real
    /// error and has to arrive as one, or the report says a module is empty when
    /// what happened was a permission or an IO fault.
    ///
    /// `fileExists(atPath:)` cannot draw that line — it answers `false` for a
    /// permission or IO fault exactly as it does for "missing", the same
    /// misclassification `try?` produced without the keyword. `attributesOfItem`
    /// throws instead, and everything that is not "no such file" propagates.
    static func scanSourceRoot(_ root: URL, relativeTo base: URL) throws -> (
        isEmpty: Bool, violations: [TokenDisciplineScanner.Violation]
    ) {
        do {
            _ = try FileManager.default.attributesOfItem(atPath: root.path)
        } catch {
            guard TokenDisciplineScanner.meansPathDoesNotExist(error) else { throw error }
            return (isEmpty: true, violations: [])
        }
        let files = try TokenDisciplineScanner.swiftFiles(under: root)
        if files.isEmpty { return (isEmpty: true, violations: []) }
        return (
            isEmpty: false,
            violations: try files.flatMap {
                try TokenDisciplineScanner.violations(in: $0, relativeTo: base)
            }
        )
    }

    /// Scans every module under a `Packages` directory, discovering them rather
    /// than working from a list: a module added tomorrow is in scope without
    /// anyone remembering to add it, which is the failure this exists to close.
    ///
    /// A directory qualifies by holding a `Package.swift`, not by being a
    /// directory — `Packages/` also accumulates SwiftPM's `.build` trees.
    /// A visible directory that does *not* qualify comes back as `unrecognised`
    /// rather than being passed over: a module whose manifest was renamed away
    /// drops silently out of scope, and silence is what this scan cannot afford.
    static func scanModules(under packages: URL) throws -> ModuleScan {
        // Every visible entry, classified into exactly one of the two buckets
        // and never filtered out. An earlier version asked each entry whether
        // it was a directory before asking about `Package.swift`, which meant
        // a metadata failure on that first, unrelated question dropped the
        // entry from `roots` AND from `unrecognised` alike — the bucket that
        // exists to notice things going missing could not notice this one.
        // The question that actually matters, "does it hold a `Package.swift`",
        // still has to ask the filesystem and can still fail; what changed is
        // that failing now means throwing, not returning a false "no".
        let candidates =
            try FileManager.default
            .contentsOfDirectory(
                at: packages, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
            )
            .sorted { $0.path < $1.path }

        // Throwing for the same reason `scanSourceRoot` does: `fileExists`
        // cannot tell "no `Package.swift`" from "couldn't check — permission or
        // IO fault on the entry itself", and the second one has to fail loudly
        // rather than land a real module in `unrecognised` as if it had been
        // looked at and found wanting.
        let isModule = { (entry: URL) throws -> Bool in
            do {
                _ = try FileManager.default.attributesOfItem(
                    atPath: entry.appending(path: "Package.swift").path)
                return true
            } catch {
                guard TokenDisciplineScanner.meansPathDoesNotExist(error) else { throw error }
                return false
            }
        }
        let roots = try candidates.filter(isModule).map { $0.appending(path: "Sources") }
        let unrecognised = try candidates.filter { try !isModule($0) }

        var emptyRoots: [URL] = []
        var violations: [TokenDisciplineScanner.Violation] = []
        for root in roots {
            let scan = try scanSourceRoot(root, relativeTo: packages)
            if scan.isEmpty {
                emptyRoots.append(root)
                continue
            }
            violations += scan.violations
        }
        return ModuleScan(
            roots: roots, emptyRoots: emptyRoots, unrecognised: unrecognised,
            violations: violations)
    }

    /// Symlinks resolved, because `FileManager` hands back resolved paths and a
    /// violation's reported path is the scanned path with its root prefix
    /// stripped — an unresolved root strips nothing (`/var` vs `/private/var`)
    /// and every path in the report comes out absolute.
    static func makeTemporaryDirectory() throws -> URL {
        let directory = URL(filePath: NSTemporaryDirectory())
            .appending(path: "token-discipline-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.resolvingSymlinksInPath()
    }

    /// A miniature of one real module — a `Package.swift` and a `Sources` tree —
    /// so what is under test is the discovery actually used and not a
    /// restatement of it. `source: nil` plants the module a rename leaves behind.
    static func plantModule(named name: String, in packages: URL, source: String?) throws {
        let module = packages.appending(path: name)
        try FileManager.default.createDirectory(at: module, withIntermediateDirectories: true)
        try "// swift-tools-version: 6.0\n"
            .write(to: module.appending(path: "Package.swift"), atomically: true, encoding: .utf8)

        guard let source else { return }
        let sources = module.appending(path: "Sources/\(name)")
        try FileManager.default.createDirectory(at: sources, withIntermediateDirectories: true)
        try source.write(
            to: sources.appending(path: "Source.swift"), atomically: true, encoding: .utf8)
    }
}
