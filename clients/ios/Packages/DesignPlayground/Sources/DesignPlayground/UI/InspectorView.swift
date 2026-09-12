import DesignSystem
import SwiftUI

/// The stage's controls: floating glass, and a panel behind the cog.
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
///
/// Three separate pieces of glass rather than one bar with things inside it,
/// which is what the platform does with a floating control now: two round
/// actions that are always exactly where they were, and beside them a capsule
/// holding the choices, which is the only piece that scrolls. A surface with
/// twenty variants moves the twenty and leaves close and the cog alone.
internal struct InspectorView: View {
    let surface: DesignSurface
    @Binding var settings: StageSettings
    @Binding var expanded: Bool
    @Binding var lift: CGFloat
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
    ///
    /// Bound rather than owned: see ``StageView/inspectorLift``.
    @GestureState private var dragging: CGFloat = 0

    var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            if expanded { ConditionsPanel(settings: $settings) }
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
        PlaygroundGlassGroup(spacing: InspectorShape.blendDistance) {
            HStack(spacing: InspectorShape.elementGap) {
                action("xmark", label: "Close", action: onClose)

                action(
                    isModified ? "gearshape.fill" : "gearshape",
                    label: expanded ? "Hide conditions" : "Show conditions",
                    // Filled when something is off-default rather than only
                    // tinted: a state a reader can get only from a hue is a
                    // state a reader who cannot separate those hues does not
                    // have.
                    tint: isModified ? Color.popsAccent : Color.popsForeground
                ) {
                    expanded.toggle()
                }
                .accessibilityValue(isModified ? modificationBadge : "Surface defaults")
                .accessibilityHint(
                    "Drag up to lift the controls clear of the screen\u{2019}s own")

                stateStrip
            }
            // The strip takes only the width its chips need, so without this
            // the whole cluster centres itself and sits somewhere different on
            // every surface. Close and the cog are fixtures; they stay put.
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .gesture(liftGesture)
    }

    /// One round floating action. Its own piece of glass, and always in the
    /// same place: the strip beside it is what moves.
    private func action(
        _ symbol: String,
        label: String,
        tint: Color = .popsForeground,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.popsSubheadline.weight(.semibold))
                .foregroundStyle(tint)
                .frame(
                    width: InspectorShape.elementHeight,
                    height: InspectorShape.elementHeight
                )
        }
        .playgroundGlass(in: InspectorShape.action)
        .accessibilityLabel(label)
    }

    /// The states, which for an experiment are its variants.
    ///
    /// The selected chip is scrolled back into view rather than the offset
    /// being preserved, and that is the stronger behaviour for the same
    /// reason it is the necessary one: ``StageView`` re-identifies the tree on
    /// every state change, so there is no offset to preserve — and with twenty
    /// variants, landing on the one you just chose is what you wanted anyway.
    private var stateStrip: some View {
        ScrollViewReader { proxy in
            ChipStrip(
                items: surface.states.map { Chip(id: $0.id, title: $0.title) },
                isOn: { $0 == settings.stateID },
                select: { settings.stateID = $0 },
                inset: InspectorShape.contentInset
            )
            .frame(height: InspectorShape.elementHeight)
            // The one piece that has to clip: `glassEffect` fills its shape
            // behind the content, so without this a chip mid-scroll draws
            // outside the capsule rather than sliding under it.
            .clipShape(InspectorShape.strip)
            .playgroundGlass(in: InspectorShape.strip)
            .onAppear { proxy.scrollTo(settings.stateID, anchor: .center) }
            .onChange(of: settings.stateID) { _, selected in
                withAnimation(.snappy(duration: 0.28)) {
                    proxy.scrollTo(selected, anchor: .center)
                }
            }
        }
    }

    private var isModified: Bool { settings.isModified(from: surface) }

    /// Read out by the cog rather than drawn beside it. The bar's width now
    /// belongs to the states, and a summary free to grow to four terms would
    /// take it back; the cog's own shape carries that something is
    /// off-default, and this says what.
    private var modificationBadge: String {
        settings.modifications(from: surface).joined(separator: " · ")
    }

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
    /// How far inside its glass a piece's content sits.
    internal static let contentInset = PopsSpacing.lg

    /// Every floating piece is one touch target tall — what iOS gives a
    /// floating control, and the smallest square a fingertip reliably hits.
    internal static let elementHeight = PopsSize.touchTarget

    /// The gap between the pieces. Wide enough that they read as three
    /// floating controls rather than as a bar someone cut two notches into.
    internal static let elementGap = PopsSpacing.md

    /// How near two pieces have to be before the platform merges their glass.
    /// Zero: merging is the one thing this layout must not do — at
    /// ``PopsSpacing/xs`` the close button and the cog grew a bridge between
    /// them and stopped reading as two buttons.
    internal static let blendDistance = PopsSpacing.zero

    /// One row of system chrome at the bottom edge, which the inspector starts
    /// clear of. A tab bar is one; so is the search field iOS 26 moved down
    /// there on iPhone, which a surface declares for itself and the stage
    /// cannot see. Anything deeper than a row is the drag's job.
    internal static let bottomChromeClearance: CGFloat = 58

    /// A single action, standing on its own.
    internal static var action: Circle { Circle() }

    /// A row of choices, which is the only piece that scrolls.
    internal static var strip: Capsule { Capsule() }

    /// The panel's corner, matched to the pieces under it so the whole control
    /// reads as one thing: a capsule ``elementHeight`` tall is round to half
    /// of it.
    ///
    /// Not a `Capsule` itself. A capsule rounds the ends of the *shorter*
    /// side, which on a panel several rows deep is half its height, and
    /// `glassEffect` fills a shape behind its content rather than clipping to
    /// it — so what that produced was a lozenge with the panel's row labels
    /// and outermost chips sitting on bare background beside it.
    internal static let panelCorner = elementHeight / 2

    /// A panel several rows deep. Continuous rather than circular because the
    /// pieces under it are, and they sit one above the other.
    internal static var panel: RoundedRectangle {
        RoundedRectangle(cornerRadius: panelCorner, style: .continuous)
    }
}
