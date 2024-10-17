import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

const gap = 8;

export function AnimatedText({ text }: { text: string }) {
  const [currentText, setCurrentText] = useState(text);
  const [nextText, setNextText] = useState(text);

  const animatedX = useRef(new Animated.Value(0)).current;
  const animatedWidth = useRef(new Animated.Value(0)).current;

  const [, setRunning] = useState(false);
  const running2 = useRef(false);

  const [width, setWidth] = useState(0);

  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (running2.current) return;
    if (text === currentText) return;

    running2.current = true;
    setRunning(true);

    setNextText(text);

    Animated.timing(animatedX, {
      toValue: -width - gap,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    })
      .start(() => {
        setCurrentText(text);

        Animated.timing(animatedX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }).start(() => {
          running2.current = false;
          setRunning(false);
        });
      });
  }, [currentText, text]);

  return (
    <Animated.View style={[styles.container, { width: animatedWidth, height }]}>
      <Animated.View
        style={{ transform: [{ translateX: animatedX }], flexDirection: "row" }}
      >
        <Text
          style={styles.text}
          onLayout={(event) => {
            const { width: newWidth, height: newHeight } = event.nativeEvent.layout;
            if(width === 0) animatedWidth.setValue(newWidth);
            setWidth(newWidth);
            setHeight(newHeight);
          }}
        >
          {currentText}
        </Text>
        {nextText !== currentText &&
          (
            <Text
              style={[styles.text, {
                transform: [{ translateX: width + gap }],
              }]}
              onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                Animated.timing(animatedWidth, {
                  toValue: width,
                  duration: 300,
                  easing: Easing.out(Easing.ease),
                  useNativeDriver: false,
                }).start();
              }}
            >
              {nextText}
            </Text>
          )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
  },
  text: {
    position: "absolute",
    color: "#007bff",
    fontWeight: "bold",
    fontSize: 42,
  },
});
