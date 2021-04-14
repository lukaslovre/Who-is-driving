addEventListener("load", function () {
  var viewport = document.querySelector("meta[name=viewport]");
  viewport.setAttribute(
    "content",
    viewport.content + ", height=" + window.innerHeight
  );
});

const socket = io();

const currentUser = document.getElementById("currentUser").innerHTML;
const readyButton = document.getElementById("changeStatusBtn");
const groupIdFromUrl = window.location.pathname.split("/")[2];
const userDivs = document.getElementById("usersDiv").children;
let thisGroupsBets;

// stavlja odgovarajuci tekst na "ready" gumb
function getCurrentStatus() {
  for (let i = 0; i < userDivs.length; i++) {
    let usernameFromDiv = userDivs[i].querySelector(".nameDiv").innerHTML;
    if (usernameFromDiv == currentUser) {
      let statusDiv = userDivs[i].querySelector(".statusDiv").innerHTML;
      setReadyButtonText(statusDiv.trim());
    }
  }
}

function setReadyButtonText(currentStatus) {
  if (currentStatus == "ready") {
    readyButton.innerHTML = "unready";
    readyButton.classList.replace("ready", "unready");
  } else {
    readyButton.innerHTML = "ready";
    readyButton.classList.replace("unready", "ready");
  }
}

getCurrentStatus();

socket.on("connect", () => {
  socket.emit("connectToRoom", groupIdFromUrl);
});

// Mjenja ready/unready stanja korisnika - kada primi
socket.on("updateValues", (users, chosenDriver) => {
  console.log("Update values triggered");
  users.forEach((user) => {
    for (let i = 0; i < userDivs.length; i++) {
      let usernameFromDiv = userDivs[i].querySelector(".nameDiv").innerHTML;
      if (usernameFromDiv === user.username) {
        let statusDiv = userDivs[i].querySelector(".statusDiv");
        statusDiv.innerHTML = user.group.status;
        if (user.group.status == "ready") {
          statusDiv.classList.replace("unready", "ready");
        } else {
          statusDiv.classList.replace("ready", "unready");
        }
      }
    }
  });
  getCurrentStatus();
  if (chosenDriver) {
    let winnerIndex;
    for (let i = 0; i < userDivs.length; i++) {
      userDivs[i].style.opacity = "0";
      if (userDivs[i].querySelector(".nameDiv").innerHTML == chosenDriver) {
        winnerIndex = i;
      }
    }
    setTimeout(() => {
      for (let i = 0; i < userDivs.length; i++) {
        userDivs[i].style.display = "none";
      }
      userDivs[winnerIndex].style.display = "block";
      userDivs[winnerIndex].style.opacity = "1";
    }, 2000);
  }
});

// mjenja svoj status i salje u db
function changePersonalState(btn) {
  let newState = btn.innerHTML;
  socket.emit("stateChange", currentUser, newState, groupIdFromUrl);
}

// salje bet u db
function bet(betAmount) {
  let balance = document.querySelector(".yourBalance").innerHTML;
  if (parseInt(betAmount) <= parseInt(balance) && parseInt(betAmount) > 0) {
    socket.emit("placeBet", betAmount, currentUser, groupIdFromUrl);
    document.querySelector(".yourBalance").innerHTML = balance - betAmount;
  } else {
    console.log("Nema dovoljno sredstva");
  }
}

// mjenja postotke
socket.on("betValues", (betData, balance, userThatBetted) => {
  betData.forEach((user) => {
    for (let i = 0; i < userDivs.length; i++) {
      let usernameFromDiv = userDivs[i].querySelector(".nameDiv").innerHTML;
      if (usernameFromDiv === user.username) {
        userDivs[i].querySelector(".percentDiv").innerHTML =
          (user.chance * 100).toFixed(1) + "%";
        if (currentUser == userThatBetted) {
          document.getElementById("betAmount").value = "";
        }
      }
    }
  });
});

// izlazi iz trenutne grupe
function leaveCurrentGroup() {
  const data = {
    username: currentUser,
    groupId: groupIdFromUrl,
  };
  fetch("/leaveGroup", {
    method: "DELETE",
    body: JSON.stringify(data),
    headers: {
      "Content-type": "application/json",
    },
  });
  window.location.href = "/home";
}
