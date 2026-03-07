//
//  SatelliteServiceBridge.m
//  TrailGuard — TG-06
//
//  React Native native module: bridges SatelliteService (Swift) to JS.
//  Extends RCTEventEmitter so JS can subscribe to satellite status events.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>
#import <CoreLocation/CoreLocation.h>

// Import the Swift-generated header so we can call SatelliteService from ObjC.
#import "TrailGuard-Swift.h"

@interface RCTSatelliteService : RCTEventEmitter <RCTBridgeModule, SatelliteServiceDelegate>
@end

@implementation RCTSatelliteService

RCT_EXPORT_MODULE(SatelliteService);

+ (BOOL)requiresMainQueueSetup { return NO; }

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onSatelliteStatusChange", @"onSatelliteLocation"];
}

// ── Methods ────────────────────────────────────────────────────────────────

RCT_EXPORT_METHOD(startMonitoring) {
    SatelliteService *service = SatelliteService.shared;
    service.delegate = self;
    [service startMonitoring];
}

RCT_EXPORT_METHOD(stopMonitoring) {
    [SatelliteService.shared stopMonitoring];
    SatelliteService.shared.delegate = nil;
}

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    SatelliteService *service = SatelliteService.shared;
    resolve(@{
        @"status":    [service statusString],
        @"supported": @(service.deviceSupportsSatellite)
    });
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(preferredSOSRoute) {
    return [SatelliteService.shared preferredSOSRoute];
}

RCT_EXPORT_METHOD(triggerEmergencySOS) {
    // iOS Emergency SOS via Satellite: on iPhone 14+ with no cellular signal,
    // the system SOS satellite flow is triggered. "ssos://" is the URL scheme
    // that hands off to the system emergency satellite UI on iOS 16+.
    dispatch_async(dispatch_get_main_queue(), ^{
        NSURL *sosURL = [NSURL URLWithString:@"ssos://"];
        UIApplication *app = [UIApplication sharedApplication];
        if ([app canOpenURL:sosURL]) {
            [app openURL:sosURL options:@{} completionHandler:nil];
        } else {
            NSURL *tel911 = [NSURL URLWithString:@"tel:911"];
            [app openURL:tel911 options:@{} completionHandler:nil];
        }
    });
}

// ── SatelliteServiceDelegate ───────────────────────────────────────────────

- (void)satelliteService:(SatelliteService *)service
         didChangeStatus:(SatelliteStatus)status {
    [self sendEventWithName:@"onSatelliteStatusChange" body:@{
        @"status":    [service statusString],
        @"supported": @(service.deviceSupportsSatellite)
    }];
}

- (void)satelliteService:(SatelliteService *)service
       didUpdateLocation:(CLLocation *)location {
    SatelliteStatus currentStatus = SatelliteService.shared.currentStatus;
    NSString *signalSource;
    switch (currentStatus) {
        case SatelliteStatusAvailable:   signalSource = @"satellite"; break;
        case SatelliteStatusUnavailable: signalSource = @"cellular";  break;
        default:                         signalSource = @"offline";   break;
    }

    [self sendEventWithName:@"onSatelliteLocation" body:@{
        @"lat":          @(location.coordinate.latitude),
        @"lng":          @(location.coordinate.longitude),
        @"altitude":     @(location.altitude),
        @"accuracy":     @(location.horizontalAccuracy),
        @"heading":      @(MAX(0, location.course)),
        @"speed":        @(MAX(0, location.speed)),
        @"timestamp":    @(location.timestamp.timeIntervalSince1970 * 1000),
        @"signalSource": signalSource
    }];
}

@end
