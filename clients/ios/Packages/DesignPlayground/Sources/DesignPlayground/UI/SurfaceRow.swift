import DesignSystem
import SwiftUI

/// One surface in the browser: what it is, and what it is drawn inside.
///
/// The chrome is shown on the row rather than only in the stage because it is
/// half of what a surface *is* here — two surfaces with the same content and
/// different chrome are two different designs, and a browser that hid that
/// would make them look like duplicates.
internal struct SurfaceRow: View {
    let surface: DesignSurface

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(surface.title)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            if let synopsis = surface.synopsis {
                Text(synopsis)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: PopsSpacing.sm) {
                badge(surface.chrome.title, symbol: surface.chrome.symbol)
                if surface.states.count > 1 {
                    badge("\(surface.states.count) states", symbol: "square.stack")
                }
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private func badge(_ text: String, symbol: String) -> some View {
        HStack(spacing: PopsSpacing.xs) {
            Image(systemName: symbol).font(.popsCaption)
            Text(text).font(.popsCaption)
        }
        .foregroundStyle(Color.popsMutedForeground)
        .padding(.horizontal, PopsSpacing.sm)
        .padding(.vertical, PopsSpacing.xs)
        .background(Color.popsSeparator.opacity(0.3), in: .capsule)
    }
}
