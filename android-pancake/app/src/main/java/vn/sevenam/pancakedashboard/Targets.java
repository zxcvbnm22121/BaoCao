package vn.sevenam.pancakedashboard;

/** KPI settings the formulas need; implemented by Store on the device. */
interface Targets {
    boolean targetsConfigured();

    /** Monthly target for ads / live / zalo. */
    double target(String key);

    /** Monthly target sent by the payload, used when no channel targets are set. */
    double payloadMonthly();

    /** Data typed for a channel over the from|to range. */
    double channelData(String from, String to, String channel);
}
