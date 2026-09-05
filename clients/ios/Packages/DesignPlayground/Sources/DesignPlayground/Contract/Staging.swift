import DesignSystem
import SwiftUI

/// Turning the other two catalogue kinds into something the stage can draw.
///
/// One stage, three kinds. A component and an experiment are both "a thing
/// with several shapes worth switching between", which is exactly what a
/// surface's states already are — so rather than a second and third stage
/// with their own inspectors, each maps onto the one that exists.

extension DesignComponent {
    /// A component as a surface: one state per shape, plus an "All" state that
    /// stacks them.
    ///
    /// The stacked state is first because it is the one that answers the
    /// question a component sheet is usually opened for — do these read as a
    /// family, and does one of them dominate. The individual states are for
    /// when the answer is no and you need one of them large.
    @MainActor func asSurface() -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "components", slug: id),
            title: name,
            synopsis: synopsis,
            chrome: .navigation,
            states: [stackedState] + states
        )
    }

    @MainActor private var stackedState: DesignState {
        let shapes = states
        let componentName = name
        return DesignState("all", "All") {
            ScrollView {
                VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                    ForEach(shapes) { shape in
                        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                            Text(shape.title)
                                .font(.popsSectionLabel)
                                .foregroundStyle(Color.popsMutedForeground)
                            shape.build()
                        }
                    }
                }
                .padding(PopsSpacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.popsBackground)
            .accessibilityLabel("\(componentName), every shape")
        }
    }
}

extension DesignExperiment {
    /// An experiment as a surface, with each variant as a state.
    ///
    /// This is what makes an A/B actually comparable: flipping is one tap in
    /// the inspector, on the same device, at the same text size and appearance
    /// — rather than two navigations that reset both and leave the reader
    /// comparing a memory against a screen.
    ///
    /// The cost is that a variant's own states collapse to its opening one.
    /// Deliberate for now: an experiment asks one question, and a variant that
    /// needs three states to answer it is usually two experiments.
    @MainActor func asSurface() -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "experiments", slug: id),
            title: question,
            synopsis: variants.map(\.title).joined(separator: " vs "),
            chrome: variants.first?.surface.chrome ?? .navigationLarge,
            states: variants.map { variant in
                DesignState(variant.id, variant.title) {
                    variant.surface.openingState?.build()
                }
            }
        )
    }
}
