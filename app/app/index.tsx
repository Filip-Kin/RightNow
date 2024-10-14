import { View } from "react-native";
import { DarkThemeToggle } from "flowbite-react";

export default function Index() {
	return (
		<View
			className="bg-gray-100 dark:bg-gray-800"
			style={{
				flex: 1,
				justifyContent: "center",
				alignItems: "center",
			}}
		>
			<DarkThemeToggle />
		</View>
	);
}
