/// <reference types="web-bluetooth" />

import { useState, useCallback, useRef, useEffect } from 'react';

export type ConnectionStatus = 'disconnected' | 'searching' | 'connected';

interface HeartRateSensorState {
  status: ConnectionStatus;
  heartRate: number | null;
  deviceName: string | null;
  batteryLevel: number | null;
  error: string | null;
}

export function useHeartRateSensor() {
  const [state, setState] = useState<HeartRateSensorState>({
    status: 'disconnected',
    heartRate: null,
    deviceName: null,
    batteryLevel: null,
    error: null,
  });

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const parseHeartRate = (value: DataView): number => {
    const flags = value.getUint8(0);
    const rate16Bits = flags & 0x1;
    if (rate16Bits) {
      return value.getUint16(1, true);
    }
    return value.getUint8(1);
  };

  const handleHeartRateChange = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (value) {
      const heartRate = parseHeartRate(value);
      setState(prev => ({ ...prev, heartRate }));
    }
  }, []);

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setState(prev => ({
        ...prev,
        error: 'Bluetooth not supported on this device/browser',
      }));
      return;
    }

    setState(prev => ({ ...prev, status: 'searching', error: null }));

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service'],
      });

      deviceRef.current = device;
      setState(prev => ({ ...prev, deviceName: device.name || 'Unknown Device' }));

      device.addEventListener('gattserverdisconnected', () => {
        setState({
          status: 'disconnected',
          heartRate: null,
          deviceName: null,
          batteryLevel: null,
          error: null,
        });
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error('Failed to connect to GATT server');

      const hrService = await server.getPrimaryService('heart_rate');
      const hrCharacteristic = await hrService.getCharacteristic('heart_rate_measurement');
      
      characteristicRef.current = hrCharacteristic;
      hrCharacteristic.addEventListener('characteristicvaluechanged', handleHeartRateChange);
      await hrCharacteristic.startNotifications();

      // Try to get battery level
      try {
        const batteryService = await server.getPrimaryService('battery_service');
        const batteryCharacteristic = await batteryService.getCharacteristic('battery_level');
        const batteryValue = await batteryCharacteristic.readValue();
        setState(prev => ({ ...prev, batteryLevel: batteryValue.getUint8(0) }));
      } catch {
        // Battery service not available
      }

      setState(prev => ({ ...prev, status: 'connected' }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setState(prev => ({
        ...prev,
        status: 'disconnected',
        error: errorMessage.includes('cancelled') ? null : errorMessage,
      }));
    }
  }, [handleHeartRateChange]);

  const disconnect = useCallback(async () => {
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleHeartRateChange);
        await characteristicRef.current.stopNotifications();
      } catch {
        // Ignore errors during cleanup
      }
    }

    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }

    deviceRef.current = null;
    characteristicRef.current = null;

    setState({
      status: 'disconnected',
      heartRate: null,
      deviceName: null,
      batteryLevel: null,
      error: null,
    });
  }, [handleHeartRateChange]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
