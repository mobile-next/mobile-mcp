import { ScreenElement } from "./robot";

export type ElementsFormat = "text" | "json";

const shortType = (type: string): string => type.substring(type.lastIndexOf(".") + 1);

const quote = (value: string): string => JSON.stringify(value);

const formatElementAsText = (element: ScreenElement): string => {
	const parts: string[] = [];
	if (element.ref) {
		parts.push(element.ref);
	}

	parts.push(shortType(element.type));

	if (element.text) {
		parts.push(`text=${quote(element.text)}`);
	}

	if (element.label) {
		parts.push(`label=${quote(element.label)}`);
	}

	if (element.name) {
		parts.push(`name=${quote(element.name)}`);
	}

	if (element.value) {
		parts.push(`value=${quote(element.value)}`);
	}

	if (element.identifier) {
		parts.push(`id=${element.identifier}`);
	}

	parts.push(`at=${element.rect.x},${element.rect.y}`);
	parts.push(`size=${element.rect.width}x${element.rect.height}`);

	// only emit non-default states, otherwise don't confuse llm
	if (element.focused) {
		parts.push("focused");
	}

	if (element.selected) {
		parts.push("selected");
	}

	if (element.checked) {
		parts.push("checked");
	}

	if (element.enabled === false) {
		parts.push("disabled");
	}

	return parts.join(" ");
};

const formatElementAsJson = (element: ScreenElement): any => {
	const out: any = {
		ref: element.ref,
		type: element.type,
		text: element.text,
		label: element.label,
		name: element.name,
		value: element.value,
		identifier: element.identifier,
		coordinates: {
			x: element.rect.x,
			y: element.rect.y,
			width: element.rect.width,
			height: element.rect.height,
		},
	};

	// only emit non-default states, otherwise don't confuse llm
	if (element.focused) {
		out.focused = true;
	}

	if (element.selected) {
		out.selected = true;
	}

	if (element.checked) {
		out.checked = true;
	}

	if (element.enabled === false) {
		out.enabled = false;
	}

	return out;
};

const TEXT_HEADER = "One element per line: @ref Type text= label= name= value= id= at=x,y size=WxH [focused] [selected] [checked] [disabled]";

export const formatElements = (elements: ScreenElement[], format: ElementsFormat): string => {
	if (format === "json") {
		return `Found these elements on screen: ${JSON.stringify(elements.map(formatElementAsJson))}`;
	}

	return [TEXT_HEADER, ...elements.map(formatElementAsText)].join("\n");
};
