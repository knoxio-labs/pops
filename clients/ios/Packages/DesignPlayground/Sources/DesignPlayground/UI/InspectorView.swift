import DesignSystem
import SwiftUI

/// The stage's controls: a glass bar that expands into a panel.
///
/// It floats *over* the surface rather than sitting beside it, and it is
/// glass rather than a filled panel, for one reason — the surface has to keep
/// the whole device. A review of a screen at 393pt conducted in 393 minus a
/// control strip is a review of a screen that does not exist.
///
/// The bar carries the surface's states, which for an experiment are its
/// variants. They sit in the open rather than behind the panel because
/// flipping between them *is* the review — an A/B that costs two taps to
/// alternate is one the reader stops alternating. Everything describing the
/// conditions rather than the subject — chrome, appearance, text size — is a
/// rarer choice, and lives behind the cog.
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
            bar
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

    private var bar: some View {
        HStack(spacing: PopsSpacing.md) {
            controls
            stateStrip
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsForeground)
        .padding(.horizontal, InspectorShape.contentInset)
        .padding(.vertical, InspectorShape.barPadding)
        .playgroundGlass(in: InspectorShape.bar)
        .gesture(liftGesture)
    }

    /// The fixed end of the bar: leave, and open the conditions.
    ///
    /// It is also where the bar gets dragged from in practice. ``liftGesture``
    /// is attached to the whole bar rather than here — a `DragGesture` bound
    /// to a container this tight claims the touch before the buttons inside it
    /// do, and both of them go dead — but a drag beginning inside the state
    /// strip belongs to that scroll view, so the part that actually lifts is
    /// this end.
    private var controls: some View {
        HStack(spacing: PopsSpacing.xs) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.popsSubheadline.weight(.semibold))
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            }
            .accessibilityLabel("Close")

            Button {
                expanded.toggle()
            } label: {
                // Filled when something is off-default rather than only
                // tinted: a state a reader can get only from a hue is a state
                // a reader who cannot separate those hues does not have.
                Image(systemName: isModified ? "gearshape.fill" : "gearshape")
                    .font(.popsSubheadline.weight(.semibold))
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .foregroundStyle(isModified ? Color.popsAccent : Color.popsForeground)
            }
            .accessibilityLabel(expanded ? "Hide conditions" : "Show conditions")
            .accessibilityValue(isModified ? modificationBadge : "Surface defaults")
            .accessibilityHint(
                "Drag the bar up to lift it clear of the screen\u{2019}s own controls")

            Divider().frame(height: PopsSpacing.xl)
        }
    }

    /// The states, which for an experiment are its variants.
    private var stateStrip: some View {
        chipStrip(
            items: surface.states.map { Chip(id: $0.id, title: $0.title) },
            isOn: { $0 == settings.stateID },
            select: { settings.stateID = $0 }
        )
    }

    private var isModified: Bool { settings.isModified(from: surface) }

    /// Read out by the cog rather than drawn beside it. The bar's width now
    /// belongs to the states, and a summary free to grow to four terms would
    /// take it back; the cog's own shape carries that something is
    /// off-default, and this says what.
    private var modificationBadge: String {
        settings.modifications(from: surface).joined(separator: " · ")
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
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
        .padding(InspectorShape.contentInset)
        .playgroundGlass(in: InspectorShape.panel)
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
            chipStrip(items: items, isOn: isOn, select: select)
        }
    }

    private func chipStrip(
        items: [Chip],
        isOn: @escaping (String) -> Bool,
        select: @escaping (String) -> Void
    ) -> some View {
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

/// The shapes the inspector is drawn in, and the measurements they come from.
///
/// Named and separated because the difference between the two is where this
/// went wrong. The bar and the panel read as one control, so both were drawn
/// in a `Capsule` — and a capsule rounds the ends of the *shorter* side, which
/// on a panel several rows deep is half its height. `glassEffect` fills a shape
/// behind its content rather than clipping to it, so what that produced was a
/// lozenge: a panel whose row labels and outermost chips sat on bare background
/// with the glass curving away underneath them.
internal enum InspectorShape {
    /// The step above and below the bar's controls.
    internal static let barPadding = PopsSpacing.sm

    /// How far inside the glass the content of either piece sits. Named rather
    /// than inlined at the two padding calls because it is half of the
    /// invariant both have to hold: the glass must reach the corners of the box
    /// this inset describes.
    internal static let contentInset = PopsSpacing.lg

    /// A single-line strip, whose ends are meant to be round.
    internal static var bar: Capsule { Capsule() }

    /// A touch target with ``barPadding`` above and below it.
    internal static let barHeight = PopsSize.touchTarget + barPadding * 2

    /// The panel's corner, matched to the bar's so the two still read as one
    /// control: a capsule ``barHeight`` tall is round to half of it.
    internal static let panelCorner = barHeight / 2

    /// One row of system chrome at the bottom edge, which the inspector starts
    /// clear of. A tab bar is one; so is the search field iOS 26 moved down
    /// there on iPhone, which a surface declares for itself and the stage
    /// cannot see. Anything deeper than a row is the drag's job.
    internal static let bottomChromeClearance: CGFloat = 58

    /// A panel several rows deep. Continuous rather than circular because the
    /// bar's ends are, and the two sit one above the other.
    internal static var panel: RoundedRectangle {
        RoundedRectangle(cornerRadius: panelCorner, style: .continuous)
    }
}
