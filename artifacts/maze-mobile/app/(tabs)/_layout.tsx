import { Tabs } from "expo-router";
import React from "react";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: "#0f1117",
        },
        headerTintColor: "#64748b",
        headerTitleStyle: {
          fontSize: 14,
          fontWeight: "500",
        },
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Made by Mubin",
        }}
      />
    </Tabs>
  );
}
