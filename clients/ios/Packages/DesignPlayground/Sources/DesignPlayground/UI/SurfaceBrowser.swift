import SwiftUI

/// The screens tab: every surface, grouped by area.
internal struct SurfaceBrowser: View {
    @State private var staged: DesignSurface?

    var body: some View {
        NavigationStack {
            List {
                ForEach(Catalog.areas, id: \.self) { area in
                    Section(area.capitalized) {
                        ForEach(Catalog.surfaces(in: area)) { surface in
                            Button {
                                staged = surface
                            } label: {
                                SurfaceRow(surface: surface)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .navigationTitle("Screens")
            .playgroundTitleDisplay(large: true)
        }
        .playgroundStage(item: $staged) { surface in
            StageView(surface: surface)
        }
    }
}
