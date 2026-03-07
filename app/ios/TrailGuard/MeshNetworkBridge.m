//
//  MeshNetworkBridge.m
//  TrailGuard — TG-07
//
//  React Native native module: bridges MeshNetworkManager (Swift) to JS.
//  Extends RCTEventEmitter so JS can subscribe to mesh events:
//    • onMeshStateChange      — peer count / running state
//    • onMeshLocationUpdate   — peer location received over mesh
//    • onMeshGroupMessage     — chat message received over mesh
//    • onMeshPeersChanged     — connected peer list updated
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import "TrailGuard-Swift.h"

@interface RCTMeshNetworkModule : RCTEventEmitter <RCTBridgeModule, MeshNetworkManagerDelegate>
@end

@implementation RCTMeshNetworkModule

RCT_EXPORT_MODULE(MeshNetworkModule);

+ (BOOL)requiresMainQueueSetup { return NO; }

- (NSArray<NSString *> *)supportedEvents {
    return @[
        @"onMeshStateChange",
        @"onMeshLocationUpdate",
        @"onMeshGroupMessage",
        @"onMeshPeersChanged",
    ];
}

// ── Start / Stop ───────────────────────────────────────────────────────────

RCT_EXPORT_METHOD(start:(NSString *)riderId riderName:(NSString *)riderName) {
    MeshNetworkManager *mgr = MeshNetworkManager.shared;
    mgr.delegate = self;
    [mgr startWithRiderId:riderId riderName:riderName];
}

RCT_EXPORT_METHOD(stop) {
    [MeshNetworkManager.shared stop];
    MeshNetworkManager.shared.delegate = nil;
}

// ── Location update from JS → push to mesh ─────────────────────────────────

RCT_EXPORT_METHOD(updateLocation:(double)lat
                  lng:(double)lng
                  speedMph:(double)speedMph
                  battery:(nonnull NSNumber *)battery) {
    [MeshNetworkManager.shared updateLocationWithLat:lat
                                                 lng:lng
                                            speedMph:speedMph
                                             battery:[battery intValue]];
}

// ── Send group message over mesh ───────────────────────────────────────────

RCT_EXPORT_METHOD(sendGroupMessage:(NSString *)text preset:(nullable NSString *)preset) {
    [MeshNetworkManager.shared sendGroupMessageWithText:text preset:preset];
}

// ── Query ──────────────────────────────────────────────────────────────────

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    MeshNetworkManager *mgr = MeshNetworkManager.shared;
    resolve(@{
        @"isRunning":   @(mgr.isRunning),
        @"peerCount":   @(mgr.connectedPeerCount),
        @"peerNames":   mgr.connectedPeerNames,
    });
}

// ── MeshNetworkManagerDelegate ─────────────────────────────────────────────

- (void)meshManager:(MeshNetworkManager *)manager
    didUpdatePeers:(NSArray<NSString *> *)peerNames {
    [self sendEventWithName:@"onMeshPeersChanged" body:@{
        @"peerNames": peerNames,
        @"peerCount": @(peerNames.count),
    }];
}

- (void)meshManager:(MeshNetworkManager *)manager
  didReceiveLocation:(NSDictionary<NSString *, id> *)info {
    [self sendEventWithName:@"onMeshLocationUpdate" body:info];
}

- (void)meshManager:(MeshNetworkManager *)manager
  didReceiveGroupMessage:(NSDictionary<NSString *, id> *)info {
    [self sendEventWithName:@"onMeshGroupMessage" body:info];
}

- (void)meshManager:(MeshNetworkManager *)manager
    didChangeState:(NSDictionary<NSString *, id> *)info {
    [self sendEventWithName:@"onMeshStateChange" body:info];
}

@end
