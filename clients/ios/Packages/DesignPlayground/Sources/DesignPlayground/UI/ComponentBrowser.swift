import DesignSystem
import SwiftUI

/// The components tab: every DesignSystem primitive, and every shape it comes
/// in.
struct ComponentBrowser: View {
    @State private var staged: DesignSurface?

    var body: some View {
        NavigationStack {
            List(Catalog.components) { component in
                Button {
                    staged = component.asSurface()
                } label: {
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(component.name)
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsForeground)
                        Text(component.synopsis)
                            .font(.popsSubheadline)
                            .foregroundStyle(Color.popsMutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, PopsSpacing.xs)
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Components")
            .playgroundTitleDisplay(large: true)
        }
        .playgroundStage(item: $staged) { surface in
            StageView(surface: surface)
        }
    }
}
