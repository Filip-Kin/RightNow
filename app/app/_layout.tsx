import { Stack } from "expo-router";
import { Flowbite } from "flowbite-react";
import "../global.css";

export default function RootLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
			}}
		>
			<Flowbite>
				<Stack.Screen name="index" />
			</Flowbite>
		</Stack>
	);
}

