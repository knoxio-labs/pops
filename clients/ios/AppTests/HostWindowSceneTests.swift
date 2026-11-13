import Foundation
import Testing
import UIKit

@Suite("App-host scene admission")
@MainActor
internal struct HostWindowSceneTests {
    @Test("an already connected real scene needs neither observer nor deadline")
    func alreadyConnected() async throws {
        let scene = try await HostWindowScene.require()
        let fixture = Fixture()
        fixture.scenes = [scene]
        let admitted = try await fixture.waiter().wait()
        #expect(admitted === scene)
        #expect(fixture.subscriptions == 0)
        #expect(fixture.deadlines == 0)
    }

    @Test("only a connected window-scene event releases a deferred admission")
    func deferredConnection() async throws {
        let scene = try await HostWindowScene.require()
        let fixture = Fixture()
        let waiter = fixture.waiter()
        let task = Task {
            defer { fixture.signalCompletion() }
            return try await waiter.wait()
        }
        do {
            var armed = fixture.armed.makeAsyncIterator()
            _ = await armed.next()
            try #require(fixture.observing)
            fixture.center.post(name: UIScene.willConnectNotification, object: NSObject())
            fixture.center.post(name: UIScene.willConnectNotification, object: scene)
            var delivery = fixture.delivered.makeAsyncIterator()
            _ = try #require(await delivery.next())
            try #require(fixture.observing)
            #expect(fixture.deadlineActive)

            fixture.scenes = [scene]
            fixture.center.post(name: UIScene.willConnectNotification, object: scene)
            let admitted = try await task.value
            #expect(admitted === scene)
            #expect(!fixture.observing)
            #expect(!fixture.deadlineActive)
            #expect(fixture.removals == 1)
        } catch {
            task.cancel()
            _ = await task.result
            throw error
        }
    }

    @Test("connection during observer registration is not lost")
    func connectionDuringRegistration() async throws {
        let scene = try await HostWindowScene.require()
        let fixture = Fixture()
        fixture.afterSubscribe = { fixture.scenes = [scene] }
        let admitted = try await fixture.waiter().wait()
        #expect(admitted === scene)
        fixture.afterSubscribe = nil
        #expect(fixture.subscriptions == 1)
        #expect(fixture.removals == 1)
        #expect(fixture.deadlines == 0)
    }

    @Test("cancellation removes both lifecycle observer and deadline")
    func cancellation() async throws {
        let fixture = Fixture()
        let waiter = fixture.waiter()
        let task = Task {
            defer { fixture.signalCompletion() }
            return try await waiter.wait()
        }
        var armed = fixture.armed.makeAsyncIterator()
        _ = await armed.next()
        task.cancel()
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(!fixture.observing)
        #expect(!fixture.deadlineActive)
        #expect(fixture.removals == 1)
    }

    @Test("absence of a connection fails at the deadline and cleans up")
    func noConnection() async throws {
        let fixture = Fixture()
        let waiter = fixture.waiter()
        let task = Task {
            defer { fixture.signalCompletion() }
            return try await waiter.wait()
        }
        var armed = fixture.armed.makeAsyncIterator()
        _ = await armed.next()
        do {
            let expire = try #require(fixture.expire)
            expire()
            await #expect(throws: HostWindowScene.Failure.connectionTimedOut) {
                try await task.value
            }
        } catch {
            task.cancel()
            _ = await task.result
            throw error
        }
        #expect(!fixture.observing)
        #expect(!fixture.deadlineActive)
        #expect(fixture.removals == 1)
    }

    @MainActor
    private final class Fixture {
        let center = NotificationCenter()
        let armed: AsyncStream<Void>
        let delivered: AsyncStream<Void>
        private let arm: AsyncStream<Void>.Continuation
        private let deliver: AsyncStream<Void>.Continuation
        var scenes: [UIWindowScene] = []
        var afterSubscribe: (() -> Void)?
        var expire: (@MainActor () -> Void)?
        var subscriptions = 0
        var removals = 0
        var deadlines = 0
        var observing = false
        var deadlineActive = false

        init() {
            let registration = AsyncStream<Void>.makeStream()
            armed = registration.stream
            arm = registration.continuation
            let delivery = AsyncStream<Void>.makeStream()
            delivered = delivery.stream
            deliver = delivery.continuation
        }

        func signalCompletion() {
            arm.yield(())
            arm.finish()
            deliver.finish()
        }

        func waiter() -> HostWindowScene {
            HostWindowScene(
                scenes: { self.scenes },
                observe: { receive in
                    self.subscriptions += 1
                    self.observing = true
                    let observe = HostWindowScene.connectionObserver(center: self.center)
                    let cleanup = observe { scene in
                        receive(scene)
                        self.deliver.yield(())
                    }
                    self.afterSubscribe?()
                    return {
                        cleanup()
                        self.observing = false
                        self.removals += 1
                    }
                },
                deadline: { expire in
                    self.deadlines += 1
                    self.deadlineActive = true
                    self.expire = expire
                    self.arm.yield(())
                    return {
                        self.deadlineActive = false
                        self.expire = nil
                    }
                })
        }
    }
}
