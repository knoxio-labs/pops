import DesignSystem
import SwiftUI

/// Every colour and every text style, resolved by the system rather than
/// listed from a spreadsheet.
///
/// The web playground has a tokens sheet too, and it reads the generated CSS.
/// This one reads the asset catalogue and the type scale *as the device
/// resolves them* — so it answers a question the generated sheet cannot: what
/// this token actually is on this hardware, in this appearance, at this text
/// size. The swatch pairs each colour with `popsBackground` and with
/// `popsSurface`, because a token is only legible or not against something.
internal struct TokensView: View {
    @Environment(\.colorScheme) private var colorScheme

    private let colors: [(name: String, color: Color)] = [
        ("popsAccent", .popsAccent),
        ("popsForeground", .popsForeground),
        ("popsMutedForeground", .popsMutedForeground),
        ("popsBackground", .popsBackground),
        ("popsSurface", .popsSurface),
        ("popsSeparator", .popsSeparator),
        ("popsSuccess", .popsSuccess),
        ("popsWarning", .popsWarning),
        ("popsDestructive", .popsDestructive),
    ]

    private let styles: [(name: String, font: Font)] = [
        ("popsLargeTitle", .popsLargeTitle),
        ("popsAmount", .popsAmount),
        ("popsTitle", .popsTitle),
        ("popsHeadline", .popsHeadline),
        ("popsBody", .popsBody),
        ("popsSubheadline", .popsSubheadline),
        ("popsSectionLabel", .popsSectionLabel),
        ("popsCaption", .popsCaption),
        ("popsMonospaced", .popsMonospaced),
        ("popsMonospacedCaption", .popsMonospacedCaption),
    ]

    var body: some View {
        NavigationStack {
            List {
                Section("Colour") {
                    ForEach(colors, id: \.name) { token in
                        swatch(name: token.name, color: token.color)
                    }
                }
                Section("Type") {
                    ForEach(styles, id: \.name) { style in
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(style.name)
                                .font(.popsCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                            Text("Handgloves 1,240.50")
                                .font(style.font)
                                .foregroundStyle(Color.popsForeground)
                        }
                        .padding(.vertical, PopsSpacing.xs)
                    }
                }
                Section("Scale") {
                    metric("PopsSpacing", values: "xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32")
                    metric("PopsRadius", values: "control 8 · card 12")
                    metric("PopsBorder", values: "hairline 1 · emphasis 2")
                    metric("PopsSize", values: "touch 44 · amount 112 · count 72")
                }
            }
            .navigationTitle("Tokens")
            .playgroundTitleDisplay(large: true)
        }
    }

    private func swatch(name: String, color: Color) -> some View {
        HStack(spacing: PopsSpacing.md) {
            ZStack {
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .fill(Color.popsBackground)
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .fill(color)
                    .padding(PopsSpacing.sm)
            }
            .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )

            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(name)
                    .font(.popsMonospacedCaption)
                    .foregroundStyle(Color.popsForeground)
                Text("On surface")
                    .font(.popsCaption)
                    .foregroundStyle(color)
                    .padding(.horizontal, PopsSpacing.sm)
                    .padding(.vertical, PopsSpacing.xs)
                    .background(Color.popsSurface, in: .capsule)
            }
            Spacer()
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private func metric(_ name: String, values: String) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(name)
                .font(.popsMonospacedCaption)
                .foregroundStyle(Color.popsForeground)
            Text(values)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}
