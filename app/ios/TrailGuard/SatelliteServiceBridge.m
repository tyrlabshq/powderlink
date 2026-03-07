//
//  SatelliteServiceBridge.m
//  TrailGuard — TG-06
//
//  Exposes SatelliteService (Swift) to React Native via the Objective-C bridge.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// RCT_EXTERN_MODULE wires the Swift class into the RN module registry.
// The Swift class must extend RCTEventEmitter and be annotated @objc(SatelliteService).
RCT_EXTERN_MODULE(SatelliteService, RCTEventEmitter)

// ── Methods ────────────────────────────────────────────────────────────────

RCT_EXTERN_METHOD(startMonitoring)
RCT_EXTERN_METHOD(stopMonitoring)
RCT_EXTERN_METHOD(triggerEmergencySOS)

RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(preferredSOSRoute)

RCT_EXTERN_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
