import DesignSystem
import SwiftUI

/// The conditions a surface is being reviewed under, as opposed to which
/// surface it is.
///
/// Behind the cog rather than on the bar, and that division is the whole
/// design: which state you are looking at changes constantly and is the
/// review, while the chrome, the appearance and the text size are chosen once
/// and then left. A control used once per session does not get to hold the
/// width of one used once per comparison.
internal struct ConditionsPanel: View {
    @Binding var settings: StageSettings

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            chromeRow
            appearanceAndDirection
            typeSizeSlider
        }
        .padding(InspectorShape.contentInset)
        .playgroundGlass(in: InspectorShape.panel)
        .padding(.bottom, PopsSpacing.sm)
    }

    private var chromeRow: some View {
        row("Chrome") {
            ChipStrip(
                items: Chrome.allCases.map {
                    Chip(id: $0.rawValue, title: $0.title, symbol: $0.symbol)
                },
                isOn: { $0 == settings.chrome.rawValue },
                select: { if let chrome = Chrome(rawValue: $0) { settings.chrome = chrome } }
            )
        }
    }

    private var appearanceAndDirection: some View {
        row("Appearance") {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(Appearance.allCases) { option in
                    ChipButton(
                        chip: Chip(id: option.rawValue, title: option.title, symbol: option.symbol),
                        isOn: settings.appearance == option
                    ) {
                        settings.appearance = option
                    }
                }
                ChipButton(
                    chip: Chip(id: "rtl", title: "RTL", symbol: "text.alignright"),
                    isOn: settings.rightToLeft
                ) {
                    settings.rightToLeft.toggle()
                }
            }
        }
    }

    /// The control the web playground structurally cannot have.
    ///
    /// `type-scale.css` pins every size at the default because a `Font.TextStyle`
    /// has no point size until the system resolves one — so the HTML frame
    /// shows one text size and the accessibility sizes, which is where iOS
    /// layouts actually break, go unreviewed. Here they are a drag away.
    private var typeSizeSlider: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack {
                label("Dynamic Type")
                Spacer()
                Text(settings.typeSize.playgroundLabel)
                    .font(.popsCaption)
                    .monospacedDigit()
                    .foregroundStyle(
                        settings.typeSize.isAccessibilitySize
                            ? Color.popsWarning : Color.popsMutedForeground)
            }
            Slider(
                value: typeSizeIndex,
                in: 0...Double(DynamicTypeSize.allCases.count - 1),
                step: 1
            )
            .tint(Color.popsAccent)
        }
    }

    private var typeSizeIndex: Binding<Double> {
        Binding(
            get: {
                Double(DynamicTypeSize.allCases.firstIndex(of: settings.typeSize) ?? 3)
            },
            set: { newValue in
                let sizes = DynamicTypeSize.allCases
                let index = min(max(Int(newValue.rounded()), 0), sizes.count - 1)
                settings.typeSize = sizes[index]
            }
        )
    }

    private func row(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            label(title)
            content()
        }
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.popsSectionLabel)
            .foregroundStyle(Color.popsMutedForeground)
    }
}
