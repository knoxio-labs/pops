import Foundation
import UIKit

@MainActor
internal final class HostWindowScene {
    internal enum Failure: Error, Equatable {
        case connectionTimedOut
    }

    internal typealias Cleanup = @MainActor () -> Void
    internal typealias Observer =
        @MainActor (@escaping @MainActor (UIWindowScene) -> Void) -> Cleanup
    internal typealias Deadline = @MainActor (@escaping @MainActor () -> Void) -> Cleanup

    private let scenes: @MainActor () -> [UIWindowScene]
    private let observe: Observer
    private let deadline: Deadline
    private var continuation: CheckedContinuation<UIWindowScene, any Error>?
    private var removeObserver: Cleanup?
    private var cancelDeadline: Cleanup?

    internal init(
        scenes: @escaping @MainActor () -> [UIWindowScene],
        observe: @escaping Observer,
        deadline: @escaping Deadline
    ) {
        self.scenes = scenes
        self.observe = observe
        self.deadline = deadline
    }

    internal static func require() async throws -> UIWindowScene {
        let readiness = HostWindowScene(
            scenes: { UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene } },
            observe: connectionObserver(),
            deadline: { expire in
                let timer = Timer(timeInterval: 5, repeats: false) { _ in
                    Task { @MainActor in expire() }
                }
                RunLoop.main.add(timer, forMode: .common)
                return { timer.invalidate() }
            })
        return try await readiness.wait()
    }

    internal static func connectionObserver(center: NotificationCenter = .default) -> Observer {
        { receive in
            let token = center.addObserver(
                forName: UIScene.willConnectNotification, object: nil, queue: .main
            ) { notification in
                guard let scene = notification.object as? UIWindowScene else { return }
                Task { @MainActor in receive(scene) }
            }
            return { center.removeObserver(token) }
        }
    }

    internal func wait() async throws -> UIWindowScene {
        try Task.checkCancellation()
        if let scene = scenes().first { return scene }
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                self.continuation = continuation
                guard !Task.isCancelled else {
                    finish(.failure(CancellationError()))
                    return
                }
                let cleanup = observe { [weak self] scene in
                    guard let self, self.scenes().contains(where: { $0 === scene }) else { return }
                    self.finish(.success(scene))
                }
                guard self.continuation != nil else {
                    cleanup()
                    return
                }
                removeObserver = cleanup
                if let scene = scenes().first {
                    finish(.success(scene))
                    return
                }
                let cancel = deadline { [weak self] in
                    self?.finish(.failure(Failure.connectionTimedOut))
                }
                if self.continuation == nil { cancel() } else { cancelDeadline = cancel }
            }
        } onCancel: {
            Task { @MainActor in self.finish(.failure(CancellationError())) }
        }
    }

    private func finish(_ result: Result<UIWindowScene, any Error>) {
        guard let continuation else { return }
        self.continuation = nil
        removeObserver?()
        removeObserver = nil
        cancelDeadline?()
        cancelDeadline = nil
        continuation.resume(with: result)
    }
}
