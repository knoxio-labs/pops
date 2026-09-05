import DesignSystem
import SwiftUI

/// The stage's controls: a glass capsule that expands into a panel.
///
/// It floats *over* the surface rather than sitting beside it, and it is
/// glass rather than a filled panel, for one reason — the surface has to keep
/// the whole device. A review of a screen at 393pt conducted in 393 minus a
/// control strip is a review of a screen that does not exist.
internal struct InspectorView: View {
    let surface: DesignSurface
    @Binding var settings: StageSettings
    @Binding var expanded: Bool
    let onClose: () -> Void

    /// How far the inspector has been lifted off the bottom edge.
    ///
    /// Draggable rather than a computed offset, because there is no offset
    /// that is right. The inspector floats at the bottom edge and so does
    /// every piece of chrome iOS 26 puts there — a tab bar, and on iPhone the
    /// search field, which moved to the bottom in 26. Which of them is under
    /// the inspector depends on the surface, the chrome and whether search is
    /// declared, and guessing produces a collision on whichever combination
    /// was not considered. Letting it be moved is both smaller and correct.
    @State private var lift: CGFloat = 0
    @GestureState private var dragging: CGFloat = 0

    var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            if expanded { panel }
            capsule
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.sm)
        .offset(y: -max(0, lift + dragging))
        .animation(.snappy(duration: 0.28), value: expanded)
    }

    /// Vertical only, and clamped: the inspector may be lifted clear of
    /// whatever is under it, and may not be dragged off the top of the screen
    /// or below the edge it started on.
    private var liftGesture: some Gesture {
        DragGesture()
            .updating($dragging) { value, state, _ in state = -value.translation.height }
            .onEnded { value in
                lift = min(max(0, lift - value.translation.height), 360)
            }
    }

    private var capsule: some View {
        HStack(spacing: PopsSpacing.md) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.popsSubheadline.weight(.semibold))
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            }
            .accessibilityLabel("Close")

            Divider().frame(height: PopsSpacing.xl)

            Button {
                expanded.toggle()
            } label: {
                HStack(spacing: PopsSpacing.sm) {
                    Text(currentStateTitle)
                        .font(.popsSubheadline)
                        .lineLimit(1)
                    if settings.isModified(from: surface) {
                        Text(modificationBadge)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsAccent)
                    }
                    Image(systemName: expanded ? "chevron.down" : "chevron.up")
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                .frame(maxWidth: .infinity)
            }
            .accessibilityLabel(expanded ? "Hide inspector" : "Show inspector")
            .accessibilityHint(
                "Drag the bar up to lift it clear of the screen\u{2019}s own controls")
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsForeground)
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
        .playgroundGlass(in: .capsule)
        .gesture(liftGesture)
    }

    /// What is off-default, shortest first. A reviewer glancing at this should
    /// be able to tell in one word whether what they are seeing is the
    /// author's intent or their own experiment.
    private var modificationBadge: String {
        var parts: [String] = []
        if settings.appearance != .light { parts.append("Dark") }
        if settings.typeSize != .playgroundDefault {
            parts.append(settings.typeSize.playgroundLabel)
        }
        if settings.rightToLeft { parts.append("RTL") }
        if settings.chrome != surface.chrome { parts.append(settings.chrome.title) }
        return parts.joined(separator: " · ")
    }

    private var currentStateTitle: String {
        surface.state(id: settings.stateID)?.title ?? "Default"
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if surface.states.count > 1 {
                chipRow(
                    title: "State",
                    items: surface.states.map { Chip(id: $0.id, title: $0.title) },
                    isOn: { $0 == settings.stateID },
                    select: { settings.stateID = $0 }
                )
            }

            chipRow(
                title: "Chrome",
                items: Chrome.allCases.map {
                    Chip(id: $0.rawValue, title: $0.title, symbol: $0.symbol)
                },
                isOn: { $0 == settings.chrome.rawValue },
                select: { if let chrome = Chrome(rawValue: $0) { settings.chrome = chrome } }
            )

            appearanceAndDirection
            typeSizeSlider
        }
        .padding(PopsSpacing.lg)
        .playgroundGlass(in: .capsule)
        .padding(.bottom, PopsSpacing.sm)
    }

    private var appearanceAndDirection: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            label("Appearance")
            HStack(spacing: PopsSpacing.sm) {
                ForEach(Appearance.allCases) { option in
                    chip(option.title, symbol: option.symbol, isOn: settings.appearance == option) {
                        settings.appearance = option
                    }
                }
                chip(
                    "RTL", symbol: "text.alignright", isOn: settings.rightToLeft,
                    action: { settings.rightToLeft.toggle() })
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

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.popsSectionLabel)
            .foregroundStyle(Color.popsMutedForeground)
    }

    private func chipRow(
        title: String,
        items: [Chip],
        isOn: @escaping (String) -> Bool,
        select: @escaping (String) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            label(title)
            ScrollView(.horizontal) {
                HStack(spacing: PopsSpacing.sm) {
                    ForEach(items) { item in
                        chip(item.title, symbol: item.symbol, isOn: isOn(item.id)) {
                            select(item.id)
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private func chip(
        _ title: String, symbol: String?, isOn: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.xs) {
                if let symbol {
                    Image(systemName: symbol).font(.popsSectionLabel)
                }
                Text(title).font(.popsCaption)
            }
            .padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            .background(
                isOn ? Color.popsAccent : Color.popsSeparator.opacity(0.35),
                in: .capsule
            )
            .foregroundStyle(isOn ? Color.popsBackground : Color.popsForeground)
        }
        .buttonStyle(.plain)
    }
}

/// One switchable option in the inspector. A named type rather than a tuple:
/// three members is past where a tuple stops explaining itself, and these are
/// built at two call sites that would otherwise have to agree by position.
internal struct Chip: Identifiable {
    internal let id: String
    internal let title: String
    internal var symbol: String?
}
