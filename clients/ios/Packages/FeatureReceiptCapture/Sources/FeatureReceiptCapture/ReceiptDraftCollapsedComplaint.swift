import DesignSystem
import SwiftUI

/// The gate's complaint as one line, opening on a tap.
///
/// Closed, it gives the screen back to the form and still says there is
/// something to know. Open, it says the same thing the banner does. The bet is
/// that a person who has read the complaint once does not need it occupying
/// the top of every subsequent receipt in the batch.
internal struct CollapsedComplaint: View {
    internal let status: ReceiptDraftView.Status

    @State private var open = false

    internal var body: some View {
        Button {
            open.toggle()
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.popsCaption)
                        .foregroundStyle(status.tone.color)
                    Text(status.heading)
                        .font(.popsSubheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.popsForeground)
                    Spacer(minLength: PopsSpacing.sm)
                    Image(systemName: open ? "chevron.up" : "chevron.down")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                if open {
                    Text(status.message)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    if let caption = status.caption {
                        Text(caption)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(PopsSpacing.md)
            .background(
                status.tone.color.opacity(0.12), in: .rect(cornerRadius: PopsRadius.control))
        }
        .buttonStyle(.plain)
        .animation(.snappy(duration: 0.2), value: open)
    }
}
