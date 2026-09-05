import DesignSystem
import SwiftUI

/// The experiments tab: open questions first, then the ones already answered.
///
/// Decided and archived experiments stay listed rather than disappearing.
/// What was chosen, and why, is the part worth keeping — a design decision
/// with no record of the alternative is one that gets relitigated every time
/// somebody new looks at the screen.
internal struct ExperimentBrowser: View {
    @State private var staged: DesignSurface?

    var body: some View {
        NavigationStack {
            List {
                section("Open", experiments: Catalog.experiments.filter(\.isOpen))
                section("Settled", experiments: Catalog.experiments.filter { !$0.isOpen })
            }
            .navigationTitle("Experiments")
            .playgroundTitleDisplay(large: true)
        }
        .playgroundStage(item: $staged) { surface in
            StageView(surface: surface)
        }
    }

    @ViewBuilder private func section(_ title: String, experiments: [DesignExperiment]) -> some View
    {
        if !experiments.isEmpty {
            Section(title) {
                ForEach(experiments) { experiment in
                    Button {
                        staged = experiment.asSurface()
                    } label: {
                        row(experiment)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func row(_ experiment: DesignExperiment) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(experiment.question)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            Text(experiment.variants.map(\.title).joined(separator: "  vs  "))
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
            statusLine(experiment)
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    @ViewBuilder private func statusLine(_ experiment: DesignExperiment) -> some View {
        switch experiment.status {
        case .open:
            Text("On \(experiment.subject.description)")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        case .decided(let variant, let rationale):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("Chose \(experiment.variants.first { $0.id == variant }?.title ?? variant)")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsSuccess)
                Text(rationale)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .archived(let reason):
            Text("Archived — \(reason)")
                .font(.popsCaption)
                .foregroundStyle(Color.popsWarning)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
