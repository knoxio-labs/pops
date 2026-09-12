import AppCore
import DesignSystem
import SwiftUI

/// One picked file, open.
///
/// Paged across everything staged rather than scoped to the receipt the page
/// belongs to, because a person checking whether a photograph came out is
/// checking all of them, and having to close and reopen between groups makes
/// that four gestures instead of one. Which is why the header has to say where
/// you are: without it, paging from the last page of one receipt to the first
/// of another is indistinguishable from paging within one.
///
/// Three ways out — the close button, a downward swipe, and a tap on the
/// ground around the page. A viewer opened by a tap should close by one.
internal struct PurchasePageViewer: View {
    internal let staged: StagedReceipts
    internal let showing: StagedPage
    internal let onDelete: (StagedPage) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var current: String
    @State private var drag: CGFloat = 0
    @State private var replacing = false

    internal init(
        staged: StagedReceipts, showing: StagedPage, onDelete: @escaping (StagedPage) -> Void
    ) {
        self.staged = staged
        self.showing = showing
        self.onDelete = onDelete
        _current = State(initialValue: showing.id)
    }

    private let dismissThreshold: CGFloat = 120

    private var pages: [StagedPage] { staged.everyPage }

    private var page: StagedPage? { pages.first { $0.id == current } }

    private var index: Int? { pages.firstIndex { $0.id == current } }

    internal var body: some View {
        ZStack {
            Color.popsBackground
                .ignoresSafeArea()
                .onTapGesture { dismiss() }
            pager
                .offset(y: drag)
                // Simultaneous, not exclusive: the pager owns the horizontal
                // drag and this only ever acts on the vertical one, so taking
                // the gesture outright would break paging to dismiss a screen
                // nobody was dismissing.
                .simultaneousGesture(dismissDrag)
        }
        .safeAreaInset(edge: .top) { header }
        .overlay(alignment: .bottom) { actions }
    }

    private var pager: some View {
        TabView(selection: $current) {
            ForEach(pages) { page in
                ZoomablePage(page: page)
                    .tag(page.id)
            }
        }
        .playgroundPagedTabs()
    }

    /// Downward only, and released below the threshold it springs back. An
    /// upward drag does nothing rather than dismissing, so a mis-swipe while
    /// looking at a tall receipt does not close the thing being looked at.
    ///
    /// Ignores any drag that is more sideways than down, because that one
    /// belongs to the pager. The threshold is a distance to beat, not the
    /// gesture's `minimumDistance` — setting it there would mean the gesture
    /// never fires until it has already passed the test, and the springback
    /// below could not happen.
    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: PopsSpacing.xl)
            .onChanged { value in
                guard Self.isVertical(value.translation) else { return }
                drag = max(value.translation.height, 0)
            }
            .onEnded { value in
                if Self.isVertical(value.translation),
                    value.translation.height > dismissThreshold
                {
                    dismiss()
                } else {
                    drag = 0
                }
            }
    }

    private static func isVertical(_ translation: CGSize) -> Bool {
        abs(translation.height) > abs(translation.width)
    }

    // MARK: Where you are

    /// `Receipt 2 · Photo 1 of 3`, or `Receipt 3 · on its own`.
    ///
    /// Both halves earn their place. The receipt number is the only thing
    /// saying whether paging left you inside the same receipt, and the photo
    /// position is the only thing saying whether there is more of this one to
    /// look at.
    private var whereYouAre: String? {
        guard let page,
            let receiptIndex = staged.receipts.firstIndex(where: {
                $0.pages.contains { $0.id == page.id }
            })
        else { return nil }
        let receipt = staged.receipts[receiptIndex]
        let name = "Receipt \(receiptIndex + 1)"
        guard receipt.pages.count > 1,
            let pageIndex = receipt.pages.firstIndex(where: { $0.id == page.id })
        else { return "\(name) · on its own" }
        return "\(name) · photo \(pageIndex + 1) of \(receipt.pages.count)"
    }

    private var header: some View {
        HStack(spacing: PopsSpacing.md) {
            circle("xmark") { dismiss() }
                .accessibilityLabel("Close")
            Spacer(minLength: PopsSpacing.sm)
            if let whereYouAre {
                Text(whereYouAre)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: PopsSpacing.sm)
            stepper
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
    }

    /// Arrows as well as the swipe. The swipe is how it will be used; the
    /// arrows are how it is used one-handed with a receipt in the other hand,
    /// which is the posture this screen is actually met in — and once a page
    /// is zoomed the swipe is a pan, so they stop being an alternative and
    /// become the only way across.
    private var stepper: some View {
        HStack(spacing: PopsSpacing.sm) {
            circle("chevron.left") { step(-1) }
                .disabled(index == 0)
                .accessibilityLabel("Previous")
            circle("chevron.right") { step(1) }
                .disabled(index.map { $0 == pages.count - 1 } ?? true)
                .accessibilityLabel("Next")
        }
    }

    private func step(_ delta: Int) {
        guard let index else { return }
        let next = index + delta
        guard pages.indices.contains(next) else { return }
        current = pages[next].id
    }

    // MARK: Acting on it

    /// Two floating controls rather than a bar. A bar reserves its height from
    /// the picture at every size, and the picture is the whole screen here —
    /// these sit over it and let the paper run underneath.
    private var actions: some View {
        HStack(spacing: PopsSpacing.md) {
            capsule("arrow.triangle.2.circlepath", "Replace", tone: Color.popsForeground) {
                replacing = true
            }
            capsule("trash", "Delete", tone: Color.popsDestructive) {
                if let page { onDelete(page) }
            }
        }
        .padding(.bottom, PopsSpacing.xl)
        .confirmationDialog(
            "Replace this photo", isPresented: $replacing, titleVisibility: .visible
        ) {
            Button("Scan a receipt") {}
            Button("Choose a photo") {}
            Button("Choose a file") {}
            Button("Cancel", role: .cancel) {}
        }
    }

    private func circle(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .padding(PopsSpacing.md)
        }
        .playgroundGlass(in: Circle())
    }

    private func capsule(
        _ symbol: String, _ title: String, tone: Color, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.sm) {
                Image(systemName: symbol)
                Text(title)
            }
            .font(.popsSubheadline)
            .fontWeight(.medium)
            .foregroundStyle(tone)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.md)
        }
        .playgroundGlass(in: Capsule())
    }
}
