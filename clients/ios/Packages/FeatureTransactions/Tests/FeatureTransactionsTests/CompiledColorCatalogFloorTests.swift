import DesignSystemTestSupport
import Testing

/// This package's own instance of `DesignSystem`'s
/// `CompiledColorCatalogFloorTests` — see that file for why. `test:packages`
/// (the host-toolchain loop) builds each package as an independent graph, so
/// a colour catalogue compiling correctly in `DesignSystem`'s own suite says
/// nothing about whether it also compiled here — the same reason this
/// package's own rendering suites carry `.requiresCompiledColorCatalog`
/// rather than trusting `DesignSystem`'s.
#if os(iOS)
    @Suite("Compiled colour catalogue floor")
    internal struct CompiledColorCatalogFloorTests {
        @Test("the lane that must compile Colors.xcassets did")
        func colorsAreCompiledOnTheCompiledAssetLane() {
            #expect(
                HostToolchainColorSupport.colorsAreCompiled,
                """
                colorsAreCompiled is false on iOS, where xcodebuild test always \
                compiles Colors.xcassets. TransactionRowRenderingTests and \
                TransactionDetailRenderingTests are skipping right now instead \
                of running — see HostToolchainColorSupport.
                """
            )
        }
    }
#endif
