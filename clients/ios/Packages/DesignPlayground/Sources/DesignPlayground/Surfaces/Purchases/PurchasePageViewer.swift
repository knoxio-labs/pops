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
/// Nothing here is reached by a swipe. There were three drags on this screen
/// at once — the pager's, the pan, and a swipe to dismiss — and three gestures
/// competing for one finger is a screen that misreads most of them. So paging
/// is the arrows and closing is the button or a tap on the ground around the
/// page; the drag belongs to the picture alone, which is the one that cannot
/// be a button.
internal struct PurchasePageViewer: View {
    internal let staged: StagedReceipts
    internal let showing: StagedPage
    internal let onDelete: (StagedPage) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var current: String

    internal init(
        staged: StagedReceipts, showing: StagedPage, onDelete: @escaping (StagedPage) -> Void
    ) {
        self.staged = staged
        self.showing = showing
        self.onDelete = onDelete
        _current = State(initialValue: showing.id)
    }

    private var pages: [StagedPage] { staged.everyPage }

    private var page: StagedPage? { pages.first { $0.id == current } }

    private var index: Int? { pages.firstIndex { $0.id == current } }

    internal var body: some View {
        ZStack {
            Color.popsBackground
                .ignoresSafeArea()
                .onTapGesture { dismiss() }
            if let page {
                ZoomablePage(page: page)
                    // A fresh instance per page, so the magnification does not
                    // survive into the next photograph. Cheaper and more
                    // certain than resetting it by hand on the way out.
                    .id(page.id)
                    .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.2), value: current)
        .safeAreaInset(edge: .top) { header }
        .overlay(alignment: .bottom) { actions }
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

    /// The only way between photographs, now that the drag belongs to the
    /// picture. Disabled at the ends rather than wrapping: a viewer that
    /// silently returns to the first photograph is one where you cannot tell
    /// you have reached the last.
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
            replace
            Button {
                if let page { onDelete(page) }
            } label: {
                capsuleLabel("trash", "Delete", tone: Color.popsDestructive)
            }
            .playgroundGlass(in: Capsule())
        }
        .padding(.bottom, PopsSpacing.xl)
    }

    /// A `Menu` rather than a confirmation dialog, and the reason is the
    /// icons. `confirmationDialog` *is* the native action sheet — it is
    /// `UIAlertController` underneath — and an alert controller's actions
    /// cannot carry an image through any API SwiftUI exposes. A `Menu` is a
    /// real `UIMenu`, takes a `Label` per item, and is what iOS 26 reaches for
    /// when one control offers a few ways to do the same thing.
    ///
    /// The sources are the capture sheet's minus manual entry: replacing a
    /// photograph with something typed is not a replacement, it is a different
    /// screen.
    private var replace: some View {
        Menu {
            Button {
            } label: {
                Label("Scan a receipt", systemImage: "doc.viewfinder")
            }
            Button {
            } label: {
                Label("Choose a photo", systemImage: "photo.on.rectangle")
            }
            Button {
            } label: {
                Label("Choose a file", systemImage: "folder")
            }
        } label: {
            capsuleLabel("arrow.triangle.2.circlepath", "Replace", tone: Color.popsForeground)
        }
        .playgroundGlass(in: Capsule())
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

    private func capsuleLabel(_ symbol: String, _ title: String, tone: Color) -> some View {
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
}
